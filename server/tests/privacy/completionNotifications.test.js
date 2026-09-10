import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/utils/db.js', () => ({ query }));
import { sendNotification } from '../../src/services/notifications.js';
import { currentNotificationBody } from '../../src/services/notificationCopy.js';

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValueOnce({ rows: [{ id: 'notice-1' }] });
  query.mockResolvedValueOnce({ rows: [] }); // No external push delivery in tests.
});

describe('completion notifications', () => {
  it('discards automatic item matches without saving or sending them', async () => {
    expect(await sendNotification('neighbor-1', 'item_match', { itemTitle: 'Drill' })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
  it('keeps explicit private offers linked to the request and item', async () => {
    await sendNotification('neighbor-1', 'request_offer', {}, { requestId: 'request-1', listingId: 'item-1' });
    const saved = query.mock.calls[0][1];
    expect(saved[1]).toBe('request_offer');
    expect(saved[3]).toContain('offered an item');
    expect(saved[6]).toBe('item-1');
    expect(saved[7]).toBe('request-1');
  });
  it.each(['return_confirmed', 'giveaway_complete'])('keeps %s tied to the exchange without asking for a rating', async type => {
    await sendNotification('neighbor-1', type, { itemTitle: 'Garden tools' }, { transactionId: 'exchange-1', listingId: 'item-1' });
    const saved = query.mock.calls[0][1];
    expect(saved[3]).toContain('Garden tools');
    expect(saved[3]).toContain('Tap to view your exchange.');
    expect(saved[3]).not.toMatch(/rating|review/i);
    expect(saved[5]).toBe('exchange-1');
    expect(saved[6]).toBe('item-1');
  });
  it('corrects old Inbox copy without rewriting unrelated user text', () => {
    const legacy = 'Drill has been returned. Tap to leave a rating for your neighbor.';
    expect(currentNotificationBody('return_confirmed', legacy)).toBe('Drill has been returned. Tap to view your exchange.');
    expect(currentNotificationBody('giveaway_complete', 'Pickup complete. Tap to leave a rating.')).toBe('Pickup complete. Tap to view your exchange.');
    expect(currentNotificationBody('new_message', legacy)).toBe(legacy);
  });
});
