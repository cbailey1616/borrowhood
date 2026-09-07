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
    for (const route of ['listings', 'requests', 'transactions', 'rentals', 'users', 'saved', 'messages', 'feed', 'safety']) {
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
    await client.query('UPDATE users SET is_verified = true WHERE id = $1', [owner]);
    const preview = await call('post', '/api/listings', owner, { ...body, visibility: ['town'], sharingConfirmed: true, townPreviewEnabled: true }, 201);
    const previewDetail = await call('get', `/api/listings/${preview.id}`, unverified);
    assert.equal(previewDetail.ownerMasked, true);
    assert.equal(JSON.stringify(previewDetail).includes(owner), false);
    const previewPhoto = new URL(previewDetail.photos[0].url || previewDetail.photos[0]).pathname;
    const photoToken = previewPhoto.split('/').pop();
    assert.equal(jwt.decode(photoToken).src, undefined);
    assert.ok(jwt.decode(photoToken).enc);
    await call('get', previewPhoto);
    await call('patch', `/api/listings/${preview.id}`, owner, { visibility: ['private'], townPreviewEnabled: false });
    // Reuse the same previously-issued photo URL after the owner stops sharing.
    await call('get', previewPhoto, null, undefined, 404);

    await client.query("UPDATE borrow_transactions SET status = 'disputed' WHERE id = $1", [exchange.id]);
    await call('get', photoPath(neighbor));
    // Pre-pickup cancellation: both participants, both API aliases, retries,
    // authorization, reservation release, and real concurrent state changes.
    const cancellationFixture = async (status = 'paid', listingId = null, listingType = 'lend') => {
      const itemId = listingId || (await client.query(`INSERT INTO listings (owner_id,title,condition,is_free,status,is_available,listing_type)
        VALUES ($1,'Cancellation test item','good',true,'active',false,$2) RETURNING id`, [owner, listingType])).rows[0].id;
      const id = (await client.query(`INSERT INTO borrow_transactions (listing_id,borrower_id,lender_id,status,requested_start_date,requested_end_date,rental_days,daily_rate,rental_fee,deposit_amount,platform_fee,lender_payout)
        VALUES ($1,$2,$3,$4,CURRENT_DATE-2,CURRENT_DATE-1,1,0,0,0,0,0) RETURNING id`, [itemId, neighbor, owner, status])).rows[0].id;
      return { id, itemId };
    };
    const cancellationState = async fixture => (await client.query(`SELECT bt.status, bt.payment_status, bt.actual_pickup_at, l.is_available
      FROM borrow_transactions bt JOIN listings l ON l.id = bt.listing_id WHERE bt.id = $1`, [fixture.id])).rows[0];
    for (const route of ['rentals', 'transactions']) {
      for (const actor of [owner, neighbor]) {
        for (const status of ['approved', 'paid']) {
          const fixture = await cancellationFixture(status);
          await call('post', `/api/${route}/${fixture.id}/cancel`, actor, {});
          await call('post', `/api/${route}/${fixture.id}/cancel`, actor, {});
          const state = await cancellationState(fixture);
          assert.deepEqual(state, { status: 'cancelled', payment_status: 'none', actual_pickup_at: null, is_available: true });
          const notices = (await client.query("SELECT user_id, from_user_id, title FROM notifications WHERE transaction_id = $1 AND type = 'borrow_cancelled'", [fixture.id])).rows;
          assert.deepEqual(notices, [{ user_id: actor === owner ? neighbor : owner, from_user_id: actor, title: 'Borrow cancelled' }]);
          await call('post', `/api/${route}/${fixture.id}/pickup`, neighbor, {}, 404);
        }
      }
      const unauthorised = await cancellationFixture();
      await call('post', `/api/${route}/${unauthorised.id}/cancel`, unverified, {}, 404);
      assert.equal((await cancellationState(unauthorised)).status, 'paid');
      await call('post', `/api/${route}/${unauthorised.id}/pickup`, neighbor, {});
      await call('post', `/api/${route}/${unauthorised.id}/cancel`, owner, {}, 409);
      assert.equal((await cancellationState(unauthorised)).is_available, false);

      const reserved = await cancellationFixture();
      const otherReservation = await cancellationFixture('paid', reserved.itemId);
      await call('post', `/api/${route}/${reserved.id}/cancel`, owner, {});
      assert.equal((await cancellationState(otherReservation)).is_available, false, 'Keep the other reservation');
      const pending = await cancellationFixture('pending');
      await call('post', `/api/${route}/${pending.id}/cancel`, neighbor, {});
      assert.equal((await cancellationState(pending)).is_available, false, 'Pending free requests do not change owner availability');

      const racing = await cancellationFixture();
      const raced = await Promise.all([
        request(listener).post(`/api/${route}/${racing.id}/cancel`).set('Authorization', `Bearer ${token(owner)}`).send({}).timeout(5000),
        request(listener).post(`/api/${route}/${racing.id}/pickup`).set('Authorization', `Bearer ${token(neighbor)}`).send({}).timeout(5000),
      ]);
      checks += raced.length;
      assert.equal(raced.filter(r => r.status === 200).length, 1);
      assert.ok(raced.every(r => [200, 404, 409].includes(r.status)), JSON.stringify(raced.map(r => r.body)));
      const raceState = await cancellationState(racing);
      assert.equal(raceState.is_available, raceState.status === 'cancelled');
      assert.equal(Boolean(raceState.actual_pickup_at), raceState.status === 'picked_up');

      const approving = await cancellationFixture('pending');
      await client.query('UPDATE listings SET is_available = true WHERE id = $1', [approving.itemId]);
      const approvalRace = await Promise.all([
        request(listener).post(`/api/${route}/${approving.id}/cancel`).set('Authorization', `Bearer ${token(neighbor)}`).send({}).timeout(5000),
        request(listener).post(`/api/${route}/${approving.id}/approve`).set('Authorization', `Bearer ${token(owner)}`).send({}).timeout(5000),
      ]);
      checks += approvalRace.length;
      assert.equal(approvalRace[0].status, 200);
      assert.ok([200, 404, 409].includes(approvalRace[1].status));
      assert.equal((await cancellationState(approving)).status, 'cancelled');
      assert.equal((await cancellationState(approving)).is_available, true);

      const giveaway = await cancellationFixture('paid', null, 'giveaway');
      await call('post', `/api/${route}/${giveaway.id}/cancel`, owner, {});
      assert.equal((await cancellationState(giveaway)).is_available, true);
    }
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
    // Exercise the actual SQL for stable pages, refresh, and permission changes.
    const seeded = await client.query(`INSERT INTO listings(owner_id,title,condition,is_free,visibility,privacy_version,status,created_at)
      SELECT $1, 'Feed item ' || n, 'good', true, 'close_friends', 1, 'active', NOW()-INTERVAL '10 days'
      FROM generate_series(1,65) n RETURNING id`, [owner]);
    const session = randomUUID();
    const page1 = await call('get', `/api/feed?session=${session}&page=1&limit=20`, owner);
    const page2 = await call('get', `/api/feed?session=${session}&page=2&limit=20`, owner);
    const page3 = await call('get', `/api/feed?session=${session}&page=3&limit=20`, owner);
    assert.equal(page3.items.length, 20, 'Feed must continue beyond the former 40-candidate cutoff');
    assert.equal(new Set([...page1.items,...page2.items,...page3.items].map(i=>i.type+':'+i.id)).size,60);
    await call('post', '/api/feed/events', owner, { events: page1.items.map(i=>({ id:i.id,type:i.type,event:'seen' })) });
    assert.deepEqual((await call('get', `/api/feed?session=${session}&page=1&limit=20`, owner)).items.map(i=>i.id),page1.items.map(i=>i.id));
    const hiddenId = page1.items.find(i=>i.type==='listing').id;
    await client.query("UPDATE listings SET visibility='private' WHERE id=$1",[hiddenId]);
    assert.equal((await call('get', `/api/feed?session=${session}&page=1&limit=20`, owner)).items.some(i=>i.id===hiddenId),false);
    const refreshed = await call('get', `/api/feed?session=${randomUUID()}&page=1&limit=20`, owner);
    assert.ok(refreshed.items.some(i=>!page1.items.some(old=>old.id===i.id)));
    await call('post', `/api/safety/${neighbor}/block`, owner);
    await call('post','/api/messages',owner,{ recipientId:neighbor,content:'Blocked outgoing',clientRequestId:randomUUID() },403);
    await call('post','/api/messages',neighbor,{ recipientId:owner,content:'Blocked incoming',clientRequestId:randomUUID() },403);
    await call('delete', `/api/safety/${neighbor}/block`, owner);
    await call('post', `/api/safety/${neighbor}/report`, owner, { reason:'Unsafe behavior' });
    const { resolveSocialAccount } = await import('../src/services/socialAuth.js');
    const { withTransaction } = await import('../src/utils/db.js');
    const social = { provider: 'google', subject: randomUUID(), email: `${randomUUID()}@example.com`, firstName: 'New', lastName: 'Neighbor', photo: null };
    const signedUp = await withTransaction(db => resolveSocialAccount(db, social));
    assert.equal(signedUp.isNewUser, true);
    assert.equal(signedUp.user.onboarding_step, 1); // New accounts see the sharing introduction.
    assert.equal(signedUp.user.onboarding_completed, false);
    const returning = await withTransaction(db => resolveSocialAccount(db, social));
    assert.equal(returning.user.id, signedUp.user.id);
    await assert.rejects(withTransaction(db => resolveSocialAccount(db, { ...social, subject: randomUUID() })), e => e.code === 'ACCOUNT_LINK_REQUIRED');
    const apple = { ...social, provider: 'apple', subject: randomUUID() };
    await withTransaction(db => resolveSocialAccount(db, apple, signedUp.user.id));
    assert.equal((await withTransaction(db => resolveSocialAccount(db, { ...apple, email: null }))).user.id, signedUp.user.id);
    await client.query("UPDATE users SET token_invalidated_at = NOW() + INTERVAL '1 minute' WHERE id = $1", [neighbor]);
    await call('get', grantedPhoto, null, undefined, 404);
    assert.equal(outboundAttempts, 0, 'The free exchange must not attempt external services.');
    console.log(`Passed ${checks} local HTTP checks: private creation, offers/revocation, photos, free approval/pickup/return, pre-pickup cancellation, and concurrent chat retries.`);
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    if (photoCreated) await unlink(photo);
    http.request = originalHttp;
    https.request = originalHttps;
    globalThis.fetch = originalFetch;
  }
}
