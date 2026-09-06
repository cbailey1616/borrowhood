import { vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
const target = new URL(process.env.DATABASE_URL || 'https://invalid');
if (process.env.PRIVACY_TEST_FRESH_CLUSTER !== 'yes' || target.hostname !== '127.0.0.1' || target.pathname !== '/borrowhood_privacy_test') throw new Error('Release suite requires the disposable local cluster.');
// Do not read any .env files or use the connected account's credentials.
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) }, config: () => ({ parsed: {} }) }));
vi.mock('../../src/services/stripe.js', async importOriginal => ({
  ...await importOriginal(),
  createStripeCustomer: vi.fn().mockImplementation(async () => ({ id: 'cus_local_' + randomUUID() })),
}));
const originalRequest = http.request;
http.request = function(options, ...args) {
  const host = typeof options === 'string' || options instanceof URL ? new URL(options).hostname : options.hostname || options.host;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) throw new Error('External HTTP blocked in release tests');
  return originalRequest.call(this, options, ...args);
};
https.request = () => { throw new Error('External HTTPS blocked in release tests'); };
globalThis.fetch = async () => { throw new Error('External fetch blocked in release tests'); };
