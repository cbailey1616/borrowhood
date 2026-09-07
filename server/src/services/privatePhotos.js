import jwt from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { townPreviewSql } from './townPreview.js';
import { S3Client, GetObjectCommand, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3';
import { query } from '../utils/db.js';
import { listingAccessSql } from '../utils/sharingPolicy.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';

const bucket = process.env.S3_BUCKET_NAME || 'borrowhood-uploads';
const region = process.env.AWS_REGION || 'us-east-1';
const s3 = new S3Client({ region });
const localRoot = path.resolve(fileURLToPath(new URL('../../uploads/', import.meta.url)));
const origin = () => (process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const photoKey = () => createHash('sha256').update('borrowhood-photo-v2:').update(process.env.JWT_SECRET).digest();
function encryptSource(source) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', photoKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(source, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url');
}
function decryptSource(data) {
  // Existing signed URLs remain usable until their one-hour expiry.
  if (data.src) return data.src;
  const bytes = Buffer.from(data.enc, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', photoKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

export function privatePhotoUrl(url, userId, sessionVersion = '') {
  if (!url) return null;
  // Access tokens rotate on every response; photo identity must not. This
  // opaque, viewer-scoped key reveals neither the storage URL nor uploader ID.
  const cacheKey = createHmac('sha256', process.env.JWT_SECRET)
    .update(JSON.stringify(['photo-cache-v1', userId, sessionVersion, url])).digest('hex');
  // Storage paths contain uploader IDs. Signing alone does not hide those IDs.
  const token = jwt.sign({ enc: encryptSource(url), photoCacheKey: cacheKey }, process.env.JWT_SECRET, {
    algorithm: 'HS256', subject: userId, audience: 'listing-photo', expiresIn: '1h',
  });
  return `${origin()}/api/private-photos/${token}?photo=${cacheKey}`;
}

// Editing must retain the original storage reference, not a temporary display URL.
export function originalPhotoUrl(url, userId) {
  if (!url.includes('/api/private-photos/')) return url;
  const token = new URL(url).pathname.split('/api/private-photos/')[1];
  const data = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: 'listing-photo', subject: userId });
  return decryptSource(data);
}

export async function ownedPhotoReferences(photos, userId) {
  const originals = photos.map(url => originalPhotoUrl(url, userId));
  for (const source of originals) {
    const url = new URL(source);
    const ownedS3 = url.hostname === `${bucket}.s3.${region}.amazonaws.com`
      && url.pathname.startsWith(`/listings/${userId}/`) && !decodeURIComponent(url.pathname).includes('..');
    const ownedLocal = url.origin === new URL(origin()).origin
      && url.pathname.startsWith(`/uploads/private-listing-${userId}-`) && !url.pathname.slice(9).includes('/');
    if (!ownedS3 && !ownedLocal) {
      const existing = await query(`SELECT 1 FROM listing_photos p JOIN listings l ON l.id = p.listing_id
        WHERE p.url = $1 AND l.owner_id = $2 LIMIT 1`, [source, userId]);
      if (!existing.rows.length) throw new Error('Use a photo uploaded for your own item.');
    }
  }
  return originals;
}

export async function readOwnedPhoto(source, userId) {
  const [original] = await ownedPhotoReferences([source], userId);
  const url = new URL(original);
  if (url.hostname === `${bucket}.s3.${region}.amazonaws.com`) {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: decodeURIComponent(url.pathname.slice(1)) }));
    if (object.ContentLength > 10 * 1024 * 1024) throw new Error('Image is too large.');
    return { imageBuffer: Buffer.from(await object.Body.transformToByteArray()), contentType: object.ContentType || 'image/jpeg' };
  }
  if (url.origin === new URL(origin()).origin && url.pathname.startsWith('/uploads/')) {
    const file = path.resolve(localRoot, decodeURIComponent(url.pathname.slice('/uploads/'.length)));
    if (!file.startsWith(localRoot + path.sep) || (await stat(file)).size > 10 * 1024 * 1024) throw new Error('Invalid image.');
    return { imageBuffer: await readFile(file), contentType: file.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }
  throw new Error('Use a photo uploaded for your own item.');
}

function managedPhoto(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === `${bucket}.s3.${region}.amazonaws.com`
      || (parsed.origin === new URL(origin()).origin && parsed.pathname.startsWith('/uploads/'));
  } catch { return false; }
}

// Wrap image fields centrally, including avatars and chat photos in the same
// private bucket. Upload PUT/publicUrl references deliberately remain untouched.
export function protectMediaResponses(req, res, next) {
  const json = res.json.bind(res);
  res.json = data => {
    const userId = req.user?.id || (data?.token && data?.user?.id);
    if (userId) res.set?.('Cache-Control', 'private, no-store');
    const walk = (value, field = '') => {
      if (typeof value === 'string' && /(?:photoUrls?|imageUrls?|photos|profilePhotoUrl|bannerUrl|evidenceUrls|damageEvidenceUrls)$/i.test(field) && managedPhoto(value)) {
        return userId ? privatePhotoUrl(value, userId, req.user?.token_invalidated_at ? new Date(req.user.token_invalidated_at).toISOString() : '') : null;
      }
      if (Array.isArray(value)) return value.map(item => walk(item, field));
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, key)]));
      }
      return value;
    };
    return json(walk(data));
  };
  next();
}

export async function servePrivatePhoto(req, res) {
  try {
    const data = jwt.verify(req.params.token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: 'listing-photo' });
    if (req.query.photo && req.query.photo !== data.photoCacheKey) return res.sendStatus(404);
    data.src = decryptSource(data);
    const viewer = await query(`SELECT id FROM users WHERE id = $1 AND status != 'suspended'
      AND (token_invalidated_at IS NULL OR token_invalidated_at <= to_timestamp($2))`, [data.sub, data.iat]);
    if (!viewer.rows.length) return res.sendStatus(404);
    const reference = await query('SELECT 1 FROM listing_photos WHERE url = $1 LIMIT 1', [data.src]);
    const allowed = reference.rows.length ? await query(`SELECT 1 FROM listing_photos p JOIN listings l ON l.id = p.listing_id
      JOIN users viewer ON viewer.id = $2 WHERE p.url = $1 AND viewer.status != 'suspended'
        AND (viewer.token_invalidated_at IS NULL OR viewer.token_invalidated_at <= to_timestamp($3))
        AND (${listingAccessSql('l', '$2')} OR ${townPreviewSql('l', 'owner_id', '$2', { listing: true })}) LIMIT 1`, [data.src, data.sub, data.iat]) : await query(`
      SELECT 1 FROM users WHERE profile_photo_url = $1
      UNION ALL SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.image_url = $1 AND m.deleted_at IS NULL AND (c.user1_id = $2 OR c.user2_id = $2)
      UNION ALL SELECT 1 FROM communities WHERE banner_url = $1
      UNION ALL SELECT 1 FROM disputes d
        JOIN borrow_transactions dt ON dt.id = d.transaction_id
        JOIN listings dl ON dl.id = dt.listing_id
        WHERE ($1 = ANY(d.photo_urls) OR $1 = ANY(d.response_photo_urls) OR $1 = ANY(d.evidence_urls))
          AND (d.claimant_user_id = $2 OR d.respondent_user_id = $2
            OR EXISTS (SELECT 1 FROM users du WHERE du.id = $2 AND du.is_admin = true)
            OR EXISTS (SELECT 1 FROM community_memberships dm WHERE dm.user_id = $2
              AND dm.community_id = dl.community_id AND dm.role = 'organizer'))
      UNION ALL SELECT 1 FROM borrow_transactions dt
        WHERE $1 = ANY(dt.damage_evidence_urls) AND (dt.borrower_id = $2 OR dt.lender_id = $2)
      UNION ALL SELECT 1 FROM lending_circles lc JOIN lending_circle_members cm ON cm.circle_id = lc.id
        WHERE lc.photo_url = $1 AND cm.user_id = $2 AND cm.status = 'active'
      UNION ALL SELECT 1 FROM bundles b WHERE b.photo_url = $1 AND (b.owner_id = $2 OR (
        EXISTS (SELECT 1 FROM bundle_items bi WHERE bi.bundle_id = b.id)
        AND NOT EXISTS (SELECT 1 FROM bundle_items bi JOIN listings l ON l.id = bi.listing_id
          WHERE bi.bundle_id = b.id AND NOT ${listingAccessSql('l', '$2', { discovery: true })})))
      LIMIT 1`, [data.src, data.sub]);
    if (!allowed.rows.length) return res.sendStatus(404);
    res.set('Cache-Control', 'private, no-store');
    const url = new URL(data.src);
    if (url.hostname === `${bucket}.s3.${region}.amazonaws.com`) {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: decodeURIComponent(url.pathname.slice(1)) }));
      res.type(object.ContentType || 'image/jpeg');
      object.Body.on('error', () => res.destroy());
      return object.Body.pipe(res);
    }
    if (url.origin === new URL(origin()).origin && url.pathname.startsWith('/uploads/')) {
      const relative = decodeURIComponent(url.pathname.slice('/uploads/'.length));
      const file = path.resolve(localRoot, relative);
      if (!file.startsWith(localRoot + path.sep)) return res.sendStatus(404);
      return res.sendFile(file, { cacheControl: false });
    }
    // Never fetch arbitrary external URLs: that would make this an SSRF proxy.
    return res.sendStatus(404);
  } catch { if (!res.headersSent) res.sendStatus(404); }
}

// Existing local listing URLs must not bypass the authenticated photo route.
export async function blockPublicListingPhoto(req, res, next) {
  try {
    if (req.path.startsWith('/private-listing-')) return res.sendStatus(404);
    const filename = path.basename(req.path);
    const rows = await query(`SELECT 1 FROM listing_photos WHERE split_part(url, '?', 1) LIKE $1 LIMIT 1`, [`%/${filename}`]);
    if (rows.rows.length) return res.sendStatus(404);
    next();
  } catch { res.sendStatus(503); }
}

// Deployment must fail closed if stored photos can still be downloaded publicly.
// This checks configuration; it does not modify bucket permissions.
export async function assertPrivatePhotoStorage() {
  const schema = await query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'privacy_version'
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'listing_shares')`);
  if (!schema.rows.length) throw new Error('Privacy release blocked: schema migration is incomplete.');
  if (!process.env.AWS_ACCESS_KEY_ID) return;
  const result = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
  const config = result.PublicAccessBlockConfiguration;
  if (!config || !['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(key => config[key] === true)) {
    throw new Error('Privacy release blocked: verify S3 Block Public Access before starting the server.');
  }
}
