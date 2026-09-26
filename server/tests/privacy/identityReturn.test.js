import { expect, it, vi } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { runInNewContext } from 'node:vm';
import { IDENTITY_RETURN_PATH, IDENTITY_RETURN_URL, serveIdentityReturn } from '../../src/services/identityReturn.js';

const app = express();
app.use(helmet());
app.get(IDENTITY_RETURN_PATH, serveIdentityReturn);

it('serves the HTTPS return path and resumes the callback supported by existing app builds', async () => {
  const url = new URL(IDENTITY_RETURN_URL);
  expect(url.protocol).toBe('https:');
  expect(url.hostname).toBe('borrowhood-production.up.railway.app');
  const response = await request(app).get(url.pathname);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('text/html');
  expect(response.text).toContain('href="borrowhood://verification-complete"');
  expect(response.text).toContain('Open Borrowhood');
  const [, nonce, script] = response.text.match(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/);
  const replace = vi.fn();
  runInNewContext(script, { window: { location: { replace } } });
  expect(replace).toHaveBeenCalledWith('borrowhood://verification-complete');
  const csp = response.headers['content-security-policy'];
  expect(csp).toContain(`script-src 'nonce-${nonce}'`);
  expect(csp).toContain(`style-src 'nonce-${nonce}'`);
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toContain('unsafe-inline');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['referrer-policy']).toBe('no-referrer');
});

it('ignores spoofed verification and redirect parameters instead of granting verification or leaking them', async () => {
  const response = await request(app).get(`${IDENTITY_RETURN_PATH}?verified=true&session_id=private-session&next=https://attacker.example`);
  expect(response.status).toBe(200);
  expect(response.text).not.toMatch(/private-session|attacker\.example|verified=true|Verification Submitted|You.re verified/);
  expect(response.text).toContain('check your verification status');
  expect(response.text).not.toContain('/api/');
  expect((await request(app).post(IDENTITY_RETURN_PATH)).status).toBe(404);
});

it('uses a fresh script nonce for every return page', async () => {
  const first = await request(app).get(IDENTITY_RETURN_PATH);
  const second = await request(app).get(IDENTITY_RETURN_PATH);
  expect(first.headers['content-security-policy']).not.toBe(second.headers['content-security-policy']);
});
