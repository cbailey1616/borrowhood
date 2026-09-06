// Called only after the fresh-cluster guard in test-privacy-migrations.js.
// Real Express routes, JWT middleware, PostgreSQL queries and local photo reads.
// External HTTP/fetch is blocked; no Stripe, AWS or push credentials are used.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';

export async function runPrivacyHttpChecks(client, owner, neighbor) {
  process.env.JWT_SECRET = randomUUID();
  process.env.STRIPE_SECRET_KEY = 'sk_test_local_placeholder_not_a_real_key';
  process.env.ANTHROPIC_API_KEY = 'local_placeholder_not_a_real_key';
  process.env.AWS_EC2_METADATA_DISABLED = 'true';
  process.env.ENABLE_PAYMENTS = 'false';
  process.env.API_URL = 'http://localhost:3000';
  let outboundAttempts = 0;
  const blocked = () => { outboundAttempts++; throw new Error('External network blocked in local privacy test.'); };
  const originalHttp = http.request;
  const originalHttps = https.request;
  const originalFetch = globalThis.fetch;
  http.request = function (options, ...args) {
    const hostname = typeof options === 'string' ? new URL(options).hostname : options.hostname || options.host;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) return blocked();
    return originalHttp.call(this, options, ...args);
  };
  https.request = blocked;
  globalThis.fetch = blocked;
  const filename = `private-listing-${owner}-${randomUUID()}.png`;
  const photo = new URL(`../uploads/${filename}`, import.meta.url);
  let photoCreated = false;
  let listener;
  let checks = 0;
  try {
    const { default: express } = await import('express');
    const { default: request } = await import('supertest');
    const { default: jwt } = await import('jsonwebtoken');
    const { protectMediaResponses, servePrivatePhoto, blockPublicListingPhoto, privatePhotoUrl } = await import('../src/services/privatePhotos.js');
    const app = express();
    app.use(express.json(), protectMediaResponses);
    app.get('/api/private-photos/:token', servePrivatePhoto);
    app.use('/uploads', blockPublicListingPhoto, (req, res) => res.sendStatus(404));
    for (const route of ['listings', 'requests', 'transactions', 'rentals', 'users', 'saved', 'messages']) {
      app.use(`/api/${route}`, (await import(`../src/routes/${route}.js`)).default);
    }
    listener = app.listen(0, '127.0.0.1');
    await new Promise(resolve => listener.once('listening', resolve));
    const token = id => jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const call = async (method, url, id, body, status = 200) => {
      let req = request(listener)[method](url).timeout(5000);
      if (id) req = req.set('Authorization', `Bearer ${token(id)}`);
      if (body !== undefined) req = req.send(body);
      const res = await req;
      const label = url.includes('/api/private-photos/') ? '/api/private-photos/[redacted]' : url;
      assert.equal(res.status, status, `${method} ${label}: ${JSON.stringify(res.body)}`);
      checks++;
      return res.body;
    };
    await mkdir(new URL('../uploads/', import.meta.url), { recursive: true });
    await writeFile(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZQAAAABJRU5ErkJggg==', 'base64'), { flag: 'wx' });
    photoCreated = true;
    const source = `http://localhost:3000/uploads/${filename}`;
    const body = { title: 'Private test drill', condition: 'good', isFree: true, photos: [source] };
    const listing = await call('post', '/api/listings', owner, body, 201);
    const itemPath = `/api/listings/${listing.id}`;
    await call('get', itemPath, null, undefined, 401);
    await call('get', itemPath, neighbor, undefined, 404);
    await call('get', itemPath, owner);
    assert.equal((await call('get', '/api/listings', neighbor)).some(item => item.id === listing.id), false);
    assert.deepEqual(await call('get', `/api/users/${owner}/listings`, neighbor), []);
    await call('post', `/api/saved/${listing.id}`, neighbor, {}, 404);
    await call('get', `/uploads/${filename}`, null, undefined, 404);
    const photoPath = id => new URL(privatePhotoUrl(source, id)).pathname;
    await call('get', photoPath(owner));
    await call('get', photoPath(neighbor), null, undefined, 404);
    await call('post', '/api/listings', owner, { ...body, visibility: ['town'] }, 400);
    const requestId = (await client.query(`INSERT INTO item_requests (user_id, title, visibility, status)
      VALUES ($1, 'Need a drill', 'town', 'open') RETURNING id`, [neighbor])).rows[0].id;
    const offerPath = `/api/requests/${requestId}/offers`;
    await call('post', offerPath, owner, { listingId: listing.id }, 201);
    await call('get', itemPath, neighbor);
    const grantedPhoto = photoPath(neighbor);
    await call('get', grantedPhoto);
    assert.equal((await call('get', '/api/listings', neighbor)).some(item => item.id === listing.id), false);
    await call('delete', `${offerPath}/${listing.id}`, owner);
    await call('get', itemPath, neighbor, undefined, 404);
    await call('get', grantedPhoto, null, undefined, 404);
    await call('post', offerPath, owner, { listingId: listing.id }, 201);
    const startDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const exchange = await call('post', '/api/transactions', neighbor, { listingId: listing.id, startDate, endDate }, 201);
    await call('post', `/api/transactions/${exchange.id}/approve`, neighbor, {}, 404);
    await call('post', `/api/transactions/${exchange.id}/approve`, owner, {});
    await call('delete', `${offerPath}/${listing.id}`, owner);
    await call('get', itemPath, neighbor); // Approval survives offer withdrawal.
    await call('post', `/api/transactions/${exchange.id}/pickup`, neighbor, { condition: 'good' });
    await call('post', `/api/rentals/${exchange.id}/return`, owner, { condition: 'good' });
    const completed = await call('get', `/api/transactions/${exchange.id}`, neighbor);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.rentalFee, 0);
    assert.equal(completed.depositAmount, 0);
    await call('get', photoPath(neighbor)); // History must keep its item photo.
    const unverified = '10000000-0000-4000-8000-000000000003';
    await client.query(`INSERT INTO users (id, email, first_name, last_name, city, state, is_verified)
      VALUES ($1, 'outsider@example.invalid', 'Outsider', 'Test', 'Upton', 'MA', false)`, [unverified]);
    await call('get', itemPath, unverified, undefined, 404);
    await call('get', photoPath(unverified), null, undefined, 404);
    await call('get', `/api/transactions/${exchange.id}`, unverified, undefined, 404);
    await client.query("UPDATE borrow_transactions SET status = 'disputed' WHERE id = $1", [exchange.id]);
    await call('get', photoPath(neighbor));
    // Real database concurrency rehearsal; one request key must create one row
    // and return the same message ID, including after an ambiguous timeout.
    assert.equal((await call('get', '/api/messages/capabilities', owner)).idempotentMessages, true);
    const sendAttempt = { recipientId: neighbor, content: 'Synthetic pickup plan', clientRequestId: randomUUID() };
    const concurrent = await Promise.all(Array.from({ length: 4 }, () => request(listener).post('/api/messages')
      .set('Authorization', `Bearer ${token(owner)}`).send(sendAttempt).timeout(5000)));
    assert.equal(concurrent.filter(res => res.status === 201).length, 1);
    assert.equal(concurrent.filter(res => res.status === 200).length, 3);
    assert.equal(new Set(concurrent.map(res => res.body.id)).size, 1);
    const stored = await client.query('SELECT COUNT(*)::int AS count FROM messages WHERE sender_id = $1 AND client_request_id = $2', [owner, sendAttempt.clientRequestId]);
    assert.equal(stored.rows[0].count, 1);
    checks += 4;
    await call('post', '/api/messages', owner, { ...sendAttempt, content: 'Different payload' }, 409);
    const replay = await call('post', '/api/messages', owner, sendAttempt);
    assert.equal(replay.id, concurrent[0].body.id);
    await client.query("UPDATE users SET token_invalidated_at = NOW() + INTERVAL '1 minute' WHERE id = $1", [neighbor]);
    await call('get', grantedPhoto, null, undefined, 404);
    assert.equal(outboundAttempts, 0, 'The free exchange must not attempt external services.');
    console.log(`Passed ${checks} local HTTP checks: private creation, offers/revocation, photos, free approval/pickup/return, and concurrent chat retries.`);
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    if (photoCreated) await unlink(photo);
    http.request = originalHttp;
    https.request = originalHttps;
    globalThis.fetch = originalFetch;
  }
}
