import { describe, it, expect, vi } from 'vitest';
import { deliverMessage } from '../../src/services/chatDelivery.js';

function database() {
  const messages = new Map();
  let conversation;
  const client = { query: vi.fn(async (sql, params) => {
    if (sql.includes('FROM user_blocks')) return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('client_request_hash FROM messages')) return { rows: messages.has(`${params[0]}:${params[1]}`) ? [messages.get(`${params[0]}:${params[1]}`)] : [] };
    if (sql.startsWith('SELECT id FROM conversations')) return { rows: conversation ? [{ id: conversation }] : [] };
    if (sql.startsWith('INSERT INTO conversations')) { conversation = 'conversation-1'; return { rows: [{ id: conversation }] }; }
    if (sql.startsWith('UPDATE conversations')) return { rows: [] };
    if (sql.startsWith('INSERT INTO messages')) {
      const row = { id: `message-${messages.size + 1}`, created_at: '2026-09-06', conversation_id: params[0], client_request_hash: params[5] };
      messages.set(`${params[1]}:${params[4]}`, row);
      return { rows: [row] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }) };
  return client;
}
const payload = { senderId: 'a', recipientId: 'b', content: 'See you at noon', listingId: 'drill', clientRequestId: 'attempt-1' };
describe('chat delivery replay contract (mocked transaction client)', () => {
  it('returns the original message on retry, without another insert', async () => {
    const client = database();
    const first = await deliverMessage(client, payload);
    const second = await deliverMessage(client, payload);
    expect(second.id).toBe(first.id);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(client.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO messages'))).toHaveLength(1);
  });
  it.each(['content', 'recipientId', 'imageUrl', 'listingId'])('rejects reusing a key with different %s', async field => {
    const client = database();
    await deliverMessage(client, payload);
    await expect(deliverMessage(client, { ...payload, [field]: 'changed' })).rejects.toMatchObject({ status: 409 });
  });
  it('scopes replay keys to the sender', async () => {
    const client = database();
    await deliverMessage(client, payload);
    expect((await deliverMessage(client, { ...payload, senderId: 'b', recipientId: 'a' })).replayed).toBe(false);
  });
  it('takes transaction locks before checking a send key and creating a conversation', async () => {
    const client = database();
    await deliverMessage(client, payload);
    expect(client.query.mock.calls.find(([sql]) => sql.includes('pg_advisory_xact_lock'))[1]).toEqual(['message:a:attempt-1']);
    const calls = client.query.mock.calls;
    expect(calls.findIndex(([sql, params]) => params?.[0] === 'conversation:a:b')).toBeLessThan(calls.findIndex(([sql]) => sql.startsWith('INSERT INTO conversations')));
  });
  it('keeps messages from older clients compatible without using new columns', async () => {
    const client = database();
    await deliverMessage(client, { ...payload, clientRequestId: undefined });
    const insert = client.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO messages'));
    expect(insert[0]).not.toContain('client_request');
  });
});
