import { it, expect } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import profileLinks from '../../src/routes/profileLinks.js';

const id = '10000000-0000-4000-8000-000000000001';
const app = express();
app.use(helmet());
app.use(profileLinks);

it('serves the iOS association as JSON without redirecting and matches the app identity', async () => {
  const response = await request(app).get('/.well-known/apple-app-site-association');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/json');
  const config = JSON.parse(readFileSync(new URL('../../../mobile/app.json', import.meta.url), 'utf8'));
  const eas = JSON.parse(readFileSync(new URL('../../../mobile/eas.json', import.meta.url), 'utf8'));
  expect(response.body.applinks.details).toEqual([{
    appID: `${eas.submit.testflight.ios.appleTeamId}.${config.expo.ios.bundleIdentifier}`,
    paths: ['/people/*'],
  }]);
  expect(config.expo.ios.associatedDomains).toContain('applinks:borrowhood-production.up.railway.app');
});

it('provides a browser fallback without exposing account information or performing an action', async () => {
  const response = await request(app).get(`/people/${id}`);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('text/html');
  expect(response.headers['referrer-policy']).toBe('no-referrer');
  expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(response.text).toContain(`href="borrowhood://people/${id}"`);
  expect(response.text).toContain('Open Borrowhood');
  expect(response.text).not.toContain('<script');
  expect(response.text).not.toContain('<form');
  expect(response.text).not.toContain('/api/');
  expect((await request(app).post(`/people/${id}`)).status).toBe(404);
});

it.each(['not-a-profile', '%3Cscript%3E', `${id}.html`, `${id}%0A`])('rejects an invalid profile ID: %s', async value => {
  const response = await request(app).get(`/people/${value}`);
  expect(response.status).toBe(404);
  expect(response.text).toBe('Profile link not found.');
});
