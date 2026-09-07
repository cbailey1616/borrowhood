import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Readable } from 'node:stream';
import { query } from '../../src/utils/db.js';
import { privatePhotoUrl, originalPhotoUrl, protectMediaResponses, servePrivatePhoto, blockPublicListingPhoto, ownedPhotoReferences, assertPrivatePhotoStorage } from '../../src/services/privatePhotos.js';

vi.mock('../../src/utils/db.js', () => ({ query: vi.fn() }));
const send = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send(...args) { return send(...args); } },
  GetObjectCommand: class {}, GetPublicAccessBlockCommand: class {},
}));
const id = '10000000-0000-4000-8000-000000000001';
const source = 'http://localhost:3000/uploads/private-listing-example.jpg';
const app = express();
app.get('/api/private-photos/:token', servePrivatePhoto);
app.use('/uploads', blockPublicListingPhoto, (req, res) => res.send('public avatar'));
beforeEach(() => {
  process.env.JWT_SECRET = 'isolated-photo-test-key-not-a-production-secret';
  vi.clearAllMocks(); query.mockResolvedValue({ rows: [] });
});

describe('protected photo delivery', () => {
  it('binds a temporary display URL to one viewer and one image', () => {
    const url = privatePhotoUrl(source, id);
    const payload = jwt.verify(new URL(url).pathname.split('/api/private-photos/')[1], process.env.JWT_SECRET, { audience: 'listing-photo', subject: id });
    expect(payload.src).toBeUndefined();
    expect(payload.enc).toEqual(expect.any(String));
    expect(JSON.stringify(payload)).not.toContain(source);
    expect(originalPhotoUrl(url, id)).toBe(source);
    expect(payload.exp - payload.iat).toBe(3600);
    expect(originalPhotoUrl(url, id)).toBe(source);
    expect(() => originalPhotoUrl(url, 'someone-else')).toThrow();
  });
  it('does not serve tampered URLs', async () => {
    const url = new URL(privatePhotoUrl(source, id));
    expect((await request(app).get(url.pathname + 'tampered')).status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
  it('preserves photo identity across refreshed API responses while rotating access tokens', () => {
    const respond = (user, image = source) => {
      const res = { json: vi.fn() };
      const original = res.json;
      protectMediaResponses({ user }, res, () => {});
      res.json({ photos: [image] });
      return new URL(original.mock.calls[0][0].photos[0]);
    };
    const first = respond({ id });
    const refreshed = respond({ id });
    expect(first.pathname).not.toBe(refreshed.pathname);
    const key = first.searchParams.get('photo');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshed.searchParams.get('photo')).toBe(key);
    expect(respond({ id: 'another-viewer' }).searchParams.get('photo')).not.toBe(key);
    expect(respond({ id, token_invalidated_at: new Date() }).searchParams.get('photo')).not.toBe(key);
    expect(respond({ id }, source + '-replacement').searchParams.get('photo')).not.toBe(key);
  });
  it('rejects a substituted cache identity before reading a private photo', async () => {
    const url = new URL(privatePhotoUrl(source, id));
    url.searchParams.set('photo', '0'.repeat(64));
    expect((await request(app).get(url.pathname + url.search)).status).toBe(404);
    expect(query).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('streams an authorized S3 image only after permission checks', async () => {
    query.mockResolvedValue({ rows: [{ id }] });
    send.mockResolvedValue({ ContentType: 'image/jpeg', Body: Readable.from(Buffer.from('test-image')) });
    const photo = 'https://borrowhood-uploads.s3.us-east-1.amazonaws.com/listings/owner/item.jpg';
    const url = new URL(privatePhotoUrl(photo, id));
    const response = await request(app).get(url.pathname + url.search);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.toString()).toBe('test-image');
    expect(query).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('denies media after the viewer session is revoked', async () => {
    expect((await request(app).get(new URL(privatePhotoUrl(source, id)).pathname)).status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
  it('never fetches arbitrary external hosts even with a valid signature', async () => {
    query.mockResolvedValue({ rows: [{ id }] });
    expect((await request(app).get(new URL(privatePhotoUrl('http://example.invalid/private.jpg', id)).pathname)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects expired URLs before touching storage', async () => {
    const token = jwt.sign({ src: source }, process.env.JWT_SECRET, { audience: 'listing-photo', subject: id, expiresIn: -1 });
    expect((await request(app).get(`/api/private-photos/${token}`)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });
  it('rechecks permissions instead of treating a saved image URL as access', async () => {
    query.mockResolvedValueOnce({ rows: [{ id }] }).mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    expect((await request(app).get(new URL(privatePhotoUrl(source, id)).pathname)).status).toBe(404);
    expect(query.mock.calls[2][0]).toContain('listing_shares');
    expect(query.mock.calls[2][0]).toContain('privacy_version = 1');
    expect(send).not.toHaveBeenCalled();
  });
  it('blocks new private uploads even before they are attached to a listing', async () => {
    expect((await request(app).get('/uploads/private-listing-example.jpg')).status).toBe(404);
  });
  it('blocks legacy raw photo URLs for existing listings', async () => {
    query.mockResolvedValue({ rows: [{ exists: 1 }] });
    expect((await request(app).get('/uploads/legacy.jpg')).status).toBe(404);
  });
  it('fails closed if raw-file permission lookup fails', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    expect((await request(app).get('/uploads/legacy.jpg')).status).toBe(503);
  });
  it('protects nested images without changing upload destinations', () => {
    const res = { json: vi.fn() };
    const original = res.json;
    protectMediaResponses({ user: { id } }, res, () => {});
    res.json({ listing: { photos: [source] }, owner: { profilePhotoUrl: source }, evidence: { photoUrls: [source] }, publicUrl: source });
    const result = original.mock.calls[0][0];
    expect(result.listing.photos[0]).toContain('/api/private-photos/');
    expect(result.owner.profilePhotoUrl).toContain('/api/private-photos/');
    expect(result.evidence.photoUrls[0]).toContain('/api/private-photos/');
    expect(result.publicUrl).toBe(source);
  });
  it('rejects borrowing another owner’s storage reference for a new item', async () => {
    await expect(ownedPhotoReferences(['https://borrowhood-uploads.s3.us-east-1.amazonaws.com/listings/other-owner/item.jpg'], id)).rejects.toThrow(/own item/);
  });
  it('blocks release when the privacy schema is missing', async () => {
    await expect(assertPrivatePhotoStorage()).rejects.toThrow(/migration/);
    expect(send).not.toHaveBeenCalled();
  });
  it('checks public access settings without modifying bucket permissions', async () => {
    const originalKey = process.env.AWS_ACCESS_KEY_ID;
    process.env.AWS_ACCESS_KEY_ID = 'isolated-test-marker';
    query.mockResolvedValue({ rows: [{ exists: 1 }] });
    send.mockResolvedValue({ PublicAccessBlockConfiguration: { BlockPublicAcls: true } });
    try { await expect(assertPrivatePhotoStorage()).rejects.toThrow(/Block Public Access/); }
    finally { if (originalKey === undefined) delete process.env.AWS_ACCESS_KEY_ID; else process.env.AWS_ACCESS_KEY_ID = originalKey; }
  });
});
