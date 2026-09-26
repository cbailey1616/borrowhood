import { ensureCommunityChatSchema } from '../../src/services/communityChat.js';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
const state = vi.hoisted(() => ({ db: null, allowed: true }));
vi.mock('../../src/utils/db.js', () => ({ query: (...args) => state.db.query(...args), withTransaction: fn => state.db.transaction(fn) }));
vi.mock('../../src/utils/logger.js', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../src/middleware/auth.js', () => ({ authenticate: (req, res, next) => { req.user = { id: req.headers['x-user'] }; next(); } }));
vi.mock('../../src/services/listingAccess.js', () => ({ canViewListing: async () => state.allowed, canViewRequest: async () => state.allowed }));
vi.mock('../../src/utils/sharingPolicy.js', () => ({ listingAccessSql: () => 'TRUE' }));
import { ensurePublicationSchema } from '../../src/services/publicationReceipts.js';
import { ensureNotificationSchema } from '../../src/services/notificationSchema.js';
import { registerPushDevice, unregisterPushDevice, revokePushDevice } from '../../src/services/pushDevices.js';
import { sendNotification, sendBulkNotification } from '../../src/services/notifications.js';
import { processPushDeliveries, expoRequest, pushMessage } from '../../src/services/pushDelivery.js';
import { sendReturnReminders } from '../../src/services/scheduler.js';
import { extendReturn } from '../../src/services/returnRecovery.js';
import { notifyThreadParticipants, getDiscussionThread } from '../../src/services/discussionNotifications.js';
import notificationRoutes from '../../src/routes/notifications.js';
import discussionRoutes from '../../src/routes/discussions.js';
import requestDiscussionRoutes from '../../src/routes/requestDiscussions.js';
import messageRoutes from '../../src/routes/messages.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const item = '44444444-4444-4444-8444-444444444444';
const root = '55555555-5555-4555-8555-555555555555';
const reply = '66666666-6666-4666-8666-666666666666';
const phone = '77777777-7777-4777-8777-777777777777';
const tablet = '88888888-8888-4888-8888-888888888888';
const secret = `${A}-${B}`;
let app;
const rows = async (sql, params) => (await state.db.query(sql, params)).rows;
const count = async table => Number((await rows(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`CREATE TABLE users(id UUID PRIMARY KEY, first_name TEXT DEFAULT 'Neighbor', last_name TEXT,
    display_name TEXT, profile_photo_url TEXT, is_verified BOOLEAN DEFAULT true, push_token TEXT, notification_preferences JSONB DEFAULT '{}');
    CREATE TABLE listings(id UUID PRIMARY KEY, title TEXT DEFAULT 'Ladder', owner_id UUID, status TEXT DEFAULT 'active', listing_type TEXT DEFAULT 'lend');
    CREATE TABLE item_requests(id UUID PRIMARY KEY, title TEXT DEFAULT 'Ladder', user_id UUID, status TEXT DEFAULT 'open');
    CREATE TABLE listing_photos(listing_id UUID, url TEXT, sort_order INT);
    CREATE TABLE borrow_transactions(id UUID PRIMARY KEY, listing_id UUID, borrower_id UUID, lender_id UUID,
      status TEXT, requested_end_date DATE, actual_pickup_at TIMESTAMPTZ DEFAULT NOW(), actual_return_at TIMESTAMPTZ,
      reminder_day_before_sent BOOLEAN DEFAULT false, reminder_day_of_sent BOOLEAN DEFAULT false);
    CREATE TABLE return_reports(transaction_id UUID REFERENCES borrow_transactions(id), status TEXT, resolved_at TIMESTAMPTZ, version INT DEFAULT 0);
    CREATE TABLE notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id), type TEXT, title TEXT, body TEXT,
      from_user_id UUID, transaction_id UUID, listing_id UUID, request_id UUID, conversation_id UUID, dispute_id UUID,
      is_read BOOLEAN DEFAULT false, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), push_sent BOOLEAN DEFAULT false);
    CREATE TABLE conversations(id UUID PRIMARY KEY, user1_id UUID, user2_id UUID, listing_id UUID, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID, sender_id UUID, content TEXT,
      image_url TEXT, deleted_at TIMESTAMPTZ, is_read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE message_reactions(message_id UUID, user_id UUID, emoji TEXT);
    CREATE TABLE listing_discussions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), listing_id UUID, request_id UUID, parent_id UUID,
      user_id UUID, content TEXT, is_hidden BOOLEAN DEFAULT false, reply_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE communities(id UUID PRIMARY KEY,name TEXT,banner_url TEXT,is_active BOOLEAN DEFAULT true,community_type TEXT DEFAULT 'neighborhood');
    CREATE TABLE community_memberships(community_id UUID REFERENCES communities,user_id UUID REFERENCES users,role TEXT DEFAULT 'member',joined_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(community_id,user_id));
    CREATE TABLE user_blocks(user_id UUID, blocked_id UUID);`);
  await ensureCommunityChatSchema();
  await ensureNotificationSchema();
  await ensurePublicationSchema();
  app = express(); app.use(express.json()); app.use('/notifications', notificationRoutes);
  app.use('/listings', discussionRoutes); app.use('/requests', requestDiscussionRoutes); app.use('/messages', messageRoutes);
}, 20000);
beforeEach(async () => {
  state.allowed = true;
  await state.db.exec(`DROP TRIGGER IF EXISTS fail_notice ON notifications;
    TRUNCATE push_deliveries, push_devices, notifications, users, listings, listing_photos,
      item_requests, borrow_transactions, conversations, messages, message_reactions, listing_discussions, user_blocks CASCADE`);
  await state.db.query('INSERT INTO users(id) VALUES($1),($2),($3)', [A,B,C]);
  await state.db.query('INSERT INTO listings(id, owner_id) VALUES($1,$2)', [item,A]);
  await state.db.query('INSERT INTO item_requests(id, user_id) VALUES($1,$2)', [item,A]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: 'ok', id: 'ticket-1' } }) }));
});
afterAll(async () => { vi.unstubAllGlobals(); await state.db.close(); });

it('clears only the viewer’s unread messages without revealing read receipts to either participant', async () => {
  await state.db.query('INSERT INTO conversations(id,user1_id,user2_id) VALUES($1,$2,$3)', [root,A,B]);
  await state.db.query("INSERT INTO messages(conversation_id,sender_id,content) VALUES($1,$2,'From A'),($1,$3,'From B')", [root,A,B]);
  const before = await request(app).get('/messages/conversations').set('x-user',A).expect(200);
  expect(before.body[0].unreadCount).toBe(1);
  const first = await request(app).get(`/messages/conversations/${root}`).set('x-user',A).expect(200);
  expect(first.body.messages).toHaveLength(2);
  expect(await rows('SELECT sender_id,is_read FROM messages ORDER BY sender_id')).toEqual([
    { sender_id: A, is_read: false }, { sender_id: B, is_read: true },
  ]);
  const after = await request(app).get('/messages/conversations').set('x-user',A).expect(200);
  expect(after.body[0].unreadCount).toBe(0);
  const second = await request(app).get(`/messages/conversations/${root}`).set('x-user',B).expect(200);
  for (const message of [...first.body.messages, ...second.body.messages]) {
    expect(message).not.toHaveProperty('isRead');
    expect(message).not.toHaveProperty('readAt');
  }
});

describe('device ownership and durable delivery', () => {
  it('migrates unique legacy tokens once, ignores ambiguous owners, and never replays old notifications', async () => {
    await state.db.query('UPDATE users SET push_token=$1 WHERE id IN ($2,$3)', ['ExponentPushToken[shared]', A,B]);
    await state.db.query('UPDATE users SET push_token=$1 WHERE id=$2', ['ExponentPushToken[unique]',C]);
    await ensureNotificationSchema(); await ensureNotificationSchema();
    expect(await rows('SELECT user_id FROM push_devices')).toEqual([{ user_id:C }]);
    expect(await count('push_deliveries')).toBe(0);
  });
  it('queues new legacy-style inserts during rollout without backfilling history', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await state.db.query("INSERT INTO notifications(user_id,type,title,body) VALUES($1,'friend_request','New request','A neighbor wants to connect')",[A]);
    expect(await count('push_deliveries')).toBe(1);
    await ensureNotificationSchema();
    expect(await count('push_deliveries')).toBe(1);
  });
  it('keeps phone and tablet, preserves pending jobs on re-registration, and transfers ownership atomically', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await registerPushDevice(A,'ExpoPushToken[tablet]',tablet,secret);
    await sendNotification(A,'friend_request',{});
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    expect(await count('push_deliveries')).toBe(2);
    await registerPushDevice(B,'ExponentPushToken[phone]',phone,secret);
    expect(await count('push_devices')).toBe(2);
    expect(await count('push_deliveries')).toBe(1);
    await processPushDeliveries();
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent.to).toBe('ExpoPushToken[tablet]'); expect(sent.data.recipientUserId).toBe(A);
  });
  it('revokes only the signed-in account’s installation and removes queued pushes', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'friend_request',{});
    await unregisterPushDevice(B,phone);
    expect(await count('push_devices')).toBe(1);
    await unregisterPushDevice(A,phone);
    await processPushDeliveries();
    expect(fetch).not.toHaveBeenCalled(); expect(await count('push_deliveries')).toBe(0);
  });
  it('allows device-only revocation after auth expires but rejects a different capability', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await revokePushDevice(phone,`${B}-${C}`,A);
    expect(await count('push_devices')).toBe(1);
    await request(app).post('/notifications/revoke-device').send({ installationId:phone,revocationSecret:secret,userId:A }).expect(200);
    expect(await count('push_devices')).toBe(0);
  });
  it('a delayed old-account revocation cannot unregister the newly signed-in account', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await registerPushDevice(B,'ExponentPushToken[phone]',phone,secret);
    await revokePushDevice(phone,secret,A);
    expect(await rows('SELECT user_id FROM push_devices')).toEqual([{user_id:B}]);
  });
  it('validates registration input', async () => {
    await request(app).put('/notifications/push-token').set('x-user',A).send({ token:'bad' }).expect(400);
    await request(app).put('/notifications/push-token').set('x-user',A).send({ token:'ExpoPushToken[phone]',installationId:phone,revocationSecret:secret }).expect(200);
    expect(await count('push_devices')).toBe(1);
  });
  it('saves notification context and jobs together, deduplicates retries and fans out to both devices', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await registerPushDevice(A,'ExpoPushToken[tablet]',tablet,secret);
    const options = { listingId:item,discussionId:reply,threadId:root,dedupeKey:'reply' };
    const id = await sendNotification(A,'discussion_reply',{},options);
    expect(await sendNotification(A,'discussion_reply',{},options)).toBe(id);
    expect(await count('notifications')).toBe(1); expect(await count('push_deliveries')).toBe(2);
    await processPushDeliveries();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).data).toMatchObject({ notificationId:id,discussionId:reply,threadId:root,recipientUserId:A });
    const inbox = await request(app).get('/notifications').set('x-user',A).expect(200);
    expect(inbox.body.notifications[0]).toMatchObject({ discussionId:reply,threadId:root });
  });
  it('retries a transient HTTP failure and checks the receipt after Expo accepts it', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'friend_request',{});
    fetch.mockResolvedValueOnce({ ok:false,status:503 });
    await processPushDeliveries();
    expect((await rows('SELECT status,last_error FROM push_deliveries'))[0]).toMatchObject({ status:'pending',last_error:'Expo HTTP 503' });
    await processPushDeliveries(); expect(fetch).toHaveBeenCalledTimes(1);
    await state.db.exec('UPDATE push_deliveries SET available_at=NOW()');
    await processPushDeliveries();
    expect((await rows('SELECT status FROM push_deliveries'))[0].status).toBe('receipt');
    expect((await rows('SELECT push_sent FROM notifications'))[0].push_sent).toBe(false);
    fetch.mockResolvedValueOnce({ ok:true,json:async()=>({ data:{ 'ticket-1':{status:'ok'} } }) });
    await state.db.exec('UPDATE push_deliveries SET available_at=NOW()');
    await processPushDeliveries();
    expect(fetch.mock.calls[2][0]).toContain('getReceipts');
    expect((await rows('SELECT status FROM push_deliveries'))[0].status).toBe('delivered');
    expect((await rows('SELECT push_sent FROM notifications'))[0].push_sent).toBe(true);
  });
  it('removes DeviceNotRegistered tokens reported by receipts', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'friend_request',{}); await processPushDeliveries();
    fetch.mockResolvedValueOnce({ ok:true,json:async()=>({data:{'ticket-1':{status:'error',details:{error:'DeviceNotRegistered'}}}}) });
    await state.db.exec('UPDATE push_deliveries SET available_at=NOW()'); await processPushDeliveries();
    expect(await count('push_devices')).toBe(0);
  });
  it('does not resend an accepted ticket when its receipt is missing', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'friend_request',{}); await processPushDeliveries();
    fetch.mockResolvedValueOnce({ok:true,json:async()=>({data:{}})});
    await state.db.exec('UPDATE push_deliveries SET available_at=NOW()'); await processPushDeliveries();
    expect((await rows('SELECT status,ticket_id FROM push_deliveries'))[0]).toEqual({status:'receipt',ticket_id:'ticket-1'});
  });
  it('retains a rotated device when an old token’s receipt says DeviceNotRegistered', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'friend_request',{}); await processPushDeliveries();
    await registerPushDevice(A,'ExponentPushToken[rotated]',phone,secret);
    fetch.mockResolvedValueOnce({ok:true,json:async()=>({data:{'ticket-1':{status:'error',details:{error:'DeviceNotRegistered'}}}})});
    await state.db.exec('UPDATE push_deliveries SET available_at=NOW()'); await processPushDeliveries();
    expect(await rows('SELECT token FROM push_devices')).toEqual([{token:'ExponentPushToken[rotated]'}]);
  });
  it('stops permanent failures and exhausted retries instead of retrying forever', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'friend_request',{});
    fetch.mockResolvedValueOnce({ok:false,status:400});
    await processPushDeliveries();
    expect((await rows('SELECT status FROM push_deliveries'))[0].status).toBe('failed');
    await sendNotification(A,'friend_request',{});
    await state.db.exec("UPDATE push_deliveries SET attempts=7 WHERE status='pending'");
    fetch.mockRejectedValueOnce(new Error('Network failure'));
    await processPushDeliveries();
    expect(await rows("SELECT status FROM push_deliveries WHERE status<>'failed'")).toEqual([]);
  });
  it('suppresses a notification read before the worker reaches it', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    const id = await sendNotification(A,'friend_request',{});
    await state.db.query('UPDATE notifications SET is_read=true WHERE id=$1',[id]);
    await processPushDeliveries();
    expect(fetch).not.toHaveBeenCalled();
    expect((await rows('SELECT status FROM push_deliveries'))[0].status).toBe('suppressed');
  });
  it('does not push already-read or muted alerts but retains their activity records', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'friend_request',{});
    await state.db.query('UPDATE users SET notification_preferences=$2 WHERE id=$1',[A,JSON.stringify({push_enabled:false})]);
    await processPushDeliveries(); expect(fetch).not.toHaveBeenCalled();
    expect(await count('notifications')).toBe(1);
  });
  it('makes dispute updates reachable from Inbox and counts them in the badge', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'dispute_opened',{}); await processPushDeliveries();
    expect(JSON.parse(fetch.mock.calls[0][1].body).badge).toBe(1);
    const inbox = await request(app).get('/notifications').set('x-user',A).expect(200);
    expect(inbox.body.unreadCount).toBe(1);
    expect(inbox.body.notifications[0].type).toBe('dispute_opened');
  });
  it('caps concurrent claims and recovers abandoned leases', async () => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    for (let i=0;i<7;i++) await sendNotification(A,'friend_request',{});
    await processPushDeliveries(); expect(fetch).toHaveBeenCalledTimes(6);
    await state.db.exec("UPDATE push_deliveries SET status='sending',lease_until=NOW()-INTERVAL '1 minute' WHERE status='pending'");
    await processPushDeliveries(); expect(fetch).toHaveBeenCalledTimes(7);
  });
  it('handles top-level errors and permanent HTTP failures explicitly', async () => {
    fetch.mockResolvedValueOnce({ok:true,json:async()=>({errors:[{message:'failure'}]})});
    await expect(expoRequest('send',{})).rejects.toThrow('invalid response');
    fetch.mockResolvedValueOnce({ok:false,status:400});
    await expect(expoRequest('send',{})).rejects.toMatchObject({permanent:true});
    expect(pushMessage({id:root,user_id:A,push_data:{recipientUserId:B}}, {token:'test'},0,{}).data.recipientUserId).toBe(A);
  });
  it.each(['verification_failed','circle_invite'])('persists previously missing event %s', async type => {
    expect(await sendNotification(A,type,{}, {circleId:item})).toBeTruthy();
    expect((await rows('SELECT type,circle_id FROM notifications'))[0]).toEqual({type,circle_id:item});
  });
  it('reports a database insert failure as bulk failure, not success', async () => {
    await state.db.exec(`CREATE OR REPLACE FUNCTION fail_notice() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_notice()`);
    expect(await sendBulkNotification([A,A],'friend_request',{})).toEqual([{userId:A,success:false,notificationId:null}]);
  });
});

describe('grouped exchange activity', () => {
  it('groups before pagination and acknowledges only the viewed snapshot for this account', async () => {
    await state.db.query("INSERT INTO borrow_transactions(id,listing_id,borrower_id,lender_id,status) VALUES($1,$2,$3,$4,'picked_up')", [root,item,A,B]);
    await state.db.query(`INSERT INTO notifications(id,user_id,type,title,transaction_id,created_at,is_read) VALUES
      ($1,$2,'request_approved','Approved',$3,'2026-09-14',false),
      ($4,$2,'pickup_confirmed','Picked up',$3,'2026-09-15',true),
      ($5,$2,'friend_accepted','Friend joined',NULL,'2026-09-13',false)`, [phone,A,root,tablet,reply]);
    const inbox = await request(app).get('/notifications?limit=1').set('x-user',A).expect(200);
    const group = inbox.body.notifications[0];
    expect(group).toMatchObject({ id: tablet, transactionId: root, isRead: false });
    expect(group.notificationIds.sort()).toEqual([phone,tablet].sort());
    expect(inbox.body.unreadCount).toBe(2);
    const second = await request(app).get('/notifications?limit=1&page=2').set('x-user',A).expect(200);
    expect(second.body.notifications[0].id).toBe(reply);
    const unread = await request(app).get('/notifications?unreadOnly=true').set('x-user',A).expect(200);
    expect(unread.body.notifications.map(n=>n.id)).toContain(tablet);

    const [newer] = await rows("INSERT INTO notifications(user_id,type,title,transaction_id) VALUES($1,'return_reminder','Return tomorrow',$2) RETURNING id", [A,root]);
    const [otherAccount] = await rows("INSERT INTO notifications(user_id,type,title,transaction_id) VALUES($1,'pickup_confirmed','Picked up',$2) RETURNING id", [B,root]);
    await request(app).post(`/notifications/${group.id}/read`).set('x-user',A)
      .send({ notificationIds: [...group.notificationIds,otherAccount.id] }).expect(200);
    expect((await rows('SELECT is_read FROM notifications WHERE id=$1',[otherAccount.id]))[0].is_read).toBe(false);
    expect((await rows('SELECT is_read FROM notifications WHERE id=$1',[newer.id]))[0].is_read).toBe(false);
    const refreshed = await request(app).get('/notifications').set('x-user',A).expect(200);
    expect(refreshed.body.notifications.filter(n=>n.transactionId===root)).toHaveLength(1);
    expect(refreshed.body.unreadCount).toBe(2);
  });

  it('counts one unread exchange and one unread conversation consistently in app and push badges', async () => {
    await state.db.query("INSERT INTO borrow_transactions(id,listing_id,borrower_id,lender_id,status,requested_end_date) VALUES($1,$2,$3,$4,'approved',CURRENT_DATE)", [root,item,A,B]);
    await state.db.query('INSERT INTO conversations(id,user1_id,user2_id) VALUES($1,$2,$3)',[reply,A,B]);
    await state.db.query("INSERT INTO messages(conversation_id,sender_id,content) VALUES($1,$2,'Hello'),($1,$2,'Noon works')",[reply,B]);
    await state.db.query("INSERT INTO notifications(user_id,type,title,transaction_id) VALUES($1,'request_approved','Approved',$2),($1,'pickup_confirmed','Pickup confirmed',$2)",[A,root]);
    const badge = await request(app).get('/notifications/badge-count').set('x-user',A).expect(200);
    expect(badge.body).toEqual({ messages: 1, notifications: 1, actions: 1, total: 2 });
    await state.db.query("UPDATE borrow_transactions SET status='picked_up' WHERE id=$1", [root]);
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await sendNotification(A,'return_reminder',{ transactionId:root, itemTitle:'Ladder', dueDate:'today' });
    await processPushDeliveries();
    expect(JSON.parse(fetch.mock.calls[0][1].body).badge).toBe(2);
  });

  it('keeps a public reply separate from an exchange update and preserves its destination', async () => {
    await state.db.query(`INSERT INTO notifications(user_id,type,title,transaction_id,discussion_id,thread_id) VALUES
      ($1,'pickup_confirmed','Pickup confirmed',$2,NULL,NULL),($1,'discussion_reply','New reply',$2,$3,$4)`,[A,root,phone,reply]);
    const inbox = await request(app).get('/notifications').set('x-user',A).expect(200);
    expect(inbox.body.unreadCount).toBe(2);
    expect(inbox.body.notifications).toHaveLength(2);
    expect(inbox.body.notifications.find(n=>n.type==='discussion_reply')).toMatchObject({ discussionId:phone, threadId:reply });
  });
});

describe('thread notifications and destinations', () => {
  it.each(['listing','request'])('notifies other participants when the %s thread starter responds', async kind => {
    const column = kind === 'listing' ? 'listing_id' : 'request_id';
    await state.db.query(`INSERT INTO listing_discussions(id,${column},user_id,parent_id,content) VALUES($1,$2,$3,NULL,'root'),($4,$2,$5,$1,'reply')`,[root,item,A,reply,B]);
    const response = await request(app).post(`/${kind==='listing'?'listings':'requests'}/${item}/discussions`).set('x-user',A).send({content:'Yes, Lauren',parentId:root}).expect(201);
    expect(await rows('SELECT user_id,thread_id,discussion_id FROM notifications')).toEqual([{user_id:B,thread_id:root,discussion_id:response.body.id}]);
  });
  it('deduplicates participants and respects blocks and lost post access', async () => {
    await state.db.query('INSERT INTO listing_discussions(id,listing_id,user_id,parent_id) VALUES($1,$2,$3,NULL),($4,$2,$5,$1)',[root,item,A,reply,B]);
    await state.db.query('INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2)',[C,B]);
    await notifyThreadParticipants({threadId:root,listingId:item,senderId:C,discussionId:phone});
    expect(await rows('SELECT user_id FROM notifications')).toEqual([{user_id:A}]);
    state.allowed=false;
    await notifyThreadParticipants({threadId:root,listingId:item,senderId:C,discussionId:tablet});
    expect(await count('notifications')).toBe(1);
  });
  it('loads an old root directly and the correct reply page, without exposing another post’s thread', async () => {
    await state.db.query('INSERT INTO listing_discussions(id,listing_id,user_id,content) VALUES($1,$2,$3,$4)',[root,item,A,'Old root']);
    await state.db.query(`INSERT INTO listing_discussions(listing_id,user_id,parent_id,content,created_at)
      SELECT $1,$2,$3,'reply '||i, NOW()+i*INTERVAL '1 second' FROM generate_series(1,60) i`,[item,B,root]);
    const [last] = await rows('SELECT id FROM listing_discussions ORDER BY created_at DESC LIMIT 1');
    const result = await getDiscussionThread('listing',item,last.id,A);
    expect(result.post.id).toBe(root); expect(result.replyPage).toBe(2);
    await request(app).get(`/listings/${phone}/discussions/${last.id}`).set('x-user',A).expect(404);
    const wrong = await request(app).get(`/listings/${phone}/discussions/${root}/replies`).set('x-user',A).expect(200);
    expect(wrong.body.replies).toEqual([]);
    await state.db.query('UPDATE listing_discussions SET is_hidden=true WHERE id=$1',[root]);
    expect(await getDiscussionThread('listing',item,last.id,A)).toBeNull();
  });
});

describe('reminders and inbox ordering', () => {
  it.each([
    [0, true], [1, true], [0, false], [1, false],
  ])('notifies an extension and delivers fresh reminders for day +%i (legacy=%s)', async (days, legacy) => {
    await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
    await registerPushDevice(B,'ExpoPushToken[tablet]',tablet,secret);
    await state.db.query(`INSERT INTO borrow_transactions(id,listing_id,borrower_id,lender_id,status,requested_end_date,
      reminder_day_before_sent,reminder_day_of_sent) VALUES($1,$2,$3,$4,'picked_up',CURRENT_DATE-2,true,true)`, [root,item,A,B]);
    const [{ oldDate, newDate }] = await rows('SELECT (CURRENT_DATE-2)::text AS "oldDate", (CURRENT_DATE+$1::int)::text AS "newDate"', [days]);
    const flag = days ? 'reminder_day_before_sent' : 'reminder_day_of_sent';
    const recipients = days ? [A] : [A,B];
    const oldIds = [];
    for (const recipient of recipients) {
      oldIds.push(await sendNotification(recipient,'return_reminder',{
        transactionId:root,itemTitle:'Ladder',dueDate:days?'tomorrow':'today',...(!legacy&&{returnDate:oldDate}),
      }, {dedupeKey:legacy?`${root}:${flag}`:`${root}:${oldDate}:${flag}`}));
    }
    // These reminders were queued for the old date but have not reached a device yet.
    await state.db.query('UPDATE notifications SET created_at=NOW()-($1::int * INTERVAL \'1 day\') WHERE id=ANY($2::uuid[])', [2+days,oldIds]);
    await extendReturn(root,B,newDate);
    expect(await rows("SELECT user_id,transaction_id,title FROM notifications WHERE type='return_date_extended'"))
      .toEqual([{user_id:A,transaction_id:root,title:'Return date updated'}]);
    expect((await rows('SELECT reminder_day_before_sent,reminder_day_of_sent FROM borrow_transactions'))[0])
      .toEqual({reminder_day_before_sent:false,reminder_day_of_sent:false});
    await sendReturnReminders(); await sendReturnReminders();
    const reminders = await rows("SELECT user_id,push_data FROM notifications WHERE type='return_reminder' AND NOT(id=ANY($1::uuid[])) ORDER BY user_id", [oldIds]);
    expect(reminders).toHaveLength(recipients.length);
    expect(reminders.map(row=>row.user_id)).toEqual(recipients);
    for (const reminder of reminders) expect(reminder.push_data).toMatchObject({returnDate:newDate,dueDate:days?'tomorrow':'today'});
    await processPushDeliveries();
    const delivered = fetch.mock.calls.map(([,options])=>JSON.parse(options.body));
    expect(delivered.filter(message=>message.data.type==='return_date_extended')).toHaveLength(1);
    expect(delivered.filter(message=>message.data.type==='return_reminder')).toHaveLength(recipients.length);
    expect(delivered.every(message=>!oldIds.includes(message.data.notificationId))).toBe(true);
    expect(await rows('SELECT status FROM push_deliveries WHERE notification_id=ANY($1::uuid[])',[oldIds]))
      .toEqual(oldIds.map(()=>({status:'suppressed'})));
  });

  it('commits reminder flags and both recipients together, and retries after a failed insert', async () => {
    await state.db.query("INSERT INTO borrow_transactions(id,listing_id,borrower_id,lender_id,status,requested_end_date) VALUES($1,$2,$3,$4,'picked_up',CURRENT_DATE)",[root,item,A,B]);
    await state.db.exec(`CREATE OR REPLACE FUNCTION fail_notice() RETURNS trigger AS $$ BEGIN
      IF NEW.user_id='${B}' THEN RAISE EXCEPTION 'second recipient failed'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_notice()`);
    await sendReturnReminders();
    expect(await count('notifications')).toBe(0);
    expect((await rows('SELECT reminder_day_of_sent FROM borrow_transactions'))[0].reminder_day_of_sent).toBe(false);
    await state.db.exec('DROP TRIGGER fail_notice ON notifications');
    await sendReturnReminders(); await sendReturnReminders();
    expect(await count('notifications')).toBe(2);
    expect((await rows('SELECT reminder_day_of_sent FROM borrow_transactions'))[0].reminder_day_of_sent).toBe(true);
  });
  it('orders conversations by latest message rather than UUID', async () => {
    await state.db.query('INSERT INTO conversations(id,user1_id,user2_id) VALUES($1,$2,$3),($4,$2,$5)',[root,A,B,reply,C]);
    await state.db.query("INSERT INTO messages(conversation_id,sender_id,content,created_at) VALUES($1,$2,'new',NOW()),($3,$4,'old',NOW()-INTERVAL '1 day')",[root,B,reply,C]);
    const response = await request(app).get('/messages/conversations').set('x-user',A).expect(200);
    expect(response.body.map(row=>row.id)).toEqual([root,reply]);
  });
});


it.each([['listing',false],['listing',true],['request',false],['request',true]])('commits %s comment, receipt and delivery jobs together (reply=%s)', async (kind, isReply) => {
  const column = kind === 'listing' ? 'listing_id' : 'request_id';
  await state.db.query(`INSERT INTO listing_discussions(id,${column},user_id,parent_id,content) VALUES($1,$2,$3,NULL,'root'),($4,$2,$5,$1,'reply')`,[root,item,A,reply,B]);
  await registerPushDevice(A,'ExponentPushToken[phone]',phone,secret);
  await registerPushDevice(B,'ExponentPushToken[tablet]',tablet,secret);
  await state.db.exec(`CREATE OR REPLACE FUNCTION fail_notice() RETURNS trigger AS $$ BEGIN
    IF NEW.user_id='${isReply ? B : A}' THEN RAISE EXCEPTION 'injected activity failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER fail_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_notice()`);
  const path = `/${kind === 'listing' ? 'listings' : 'requests'}/${item}/discussions`;
  const payload = {content:'Tomorrow works',clientRequestId:phone,...(isReply ? {parentId:root} : {})};
  await request(app).post(path).set('x-user',C).send(payload).expect(500);
  expect(await count('listing_discussions')).toBe(2);
  expect(await count('publication_receipts')).toBe(0);
  expect(await count('notifications')).toBe(0);
  expect(await count('push_deliveries')).toBe(0);
  await state.db.exec('DROP TRIGGER fail_notice ON notifications');
  const first=await request(app).post(path).set('x-user',C).send(payload).expect(201);
  const repeat=await request(app).post(path).set('x-user',C).send(payload).expect(201);
  expect(repeat.body.id).toBe(first.body.id);
  expect(await count('listing_discussions')).toBe(3);
  expect(await count('publication_receipts')).toBe(1);
  expect(await count('notifications')).toBe(isReply ? 2 : 1);
  expect(await count('push_deliveries')).toBe(isReply ? 2 : 1);
  expect(fetch).not.toHaveBeenCalled(); // Delivery is deferred until after commit.
});

it('combines neighborhood channels with direct messages and counts each unread channel once', async () => {
  const hood = '99999999-9999-4999-8999-999999999999';
  await state.db.query("INSERT INTO communities(id,name) VALUES($1,'Maple Grove')", [hood]);
  await state.db.query('INSERT INTO community_memberships(community_id,user_id) VALUES($1,$2)',[hood,A]);
  await state.db.query(`INSERT INTO community_chat_messages(community_id,sender_id,content,client_request_id)
    VALUES($1,$2,'Hello',gen_random_uuid()),($1,$2,'Again',gen_random_uuid())`,[hood,B]);
  const inbox = await request(app).get('/messages/conversations').set('x-user',A).expect(200);
  expect(inbox.body.find(c=>c.communityId===hood)).toMatchObject({name:'Maple Grove',unreadCount:2});
  const badge = await request(app).get('/notifications/badge-count').set('x-user',A).expect(200);
  expect(badge.body.messages).toBe(1);
  await state.db.query('UPDATE community_memberships SET chat_muted=true WHERE community_id=$1',[hood]);
  expect((await request(app).get('/notifications/badge-count').set('x-user',A)).body.messages).toBe(0);
});
it('does not give new neighborhood members an old preview or notification badge', async () => {
  const hood = '99999999-9999-4999-8999-999999999998';
  await state.db.query("INSERT INTO communities(id,name) VALUES($1,'New neighborhood')", [hood]);
  await state.db.query(`INSERT INTO community_chat_messages(community_id,sender_id,content,client_request_id)
    VALUES($1,$2,'Before joining',gen_random_uuid())`,[hood,B]);
  await state.db.query('INSERT INTO community_memberships(community_id,user_id) VALUES($1,$2)',[hood,A]);
  const inbox = await request(app).get('/messages/conversations').set('x-user',A).expect(200);
  expect(inbox.body.find(c=>c.communityId===hood)).toMatchObject({lastMessage:null,lastMessageAt:null,unreadCount:0});
  expect((await request(app).get('/notifications/badge-count').set('x-user',A)).body.messages).toBe(0);
  await state.db.query(`INSERT INTO community_chat_messages(community_id,sender_id,content,client_request_id)
    VALUES($1,$2,'After joining',gen_random_uuid())`,[hood,B]);
  const updated = await request(app).get('/messages/conversations').set('x-user',A).expect(200);
  expect(updated.body.find(c=>c.communityId===hood)).toMatchObject({lastMessage:'After joining',unreadCount:1});
  expect((await request(app).get('/notifications/badge-count').set('x-user',A)).body.messages).toBe(1);
});
