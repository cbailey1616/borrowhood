import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/utils/db.js', () => ({ query }));
import { sendNotification } from '../../src/services/notifications.js';
import { currentNotificationBody, currentNotificationTitle } from '../../src/services/notificationCopy.js';

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
  it.each(['pickup_confirmed', 'giveaway_complete'])('uses %s copy that makes sense for either participant', async type => {
    await sendNotification('owner-or-borrower', type, { itemTitle: 'Garden tools', returnDate: '2026-09-15' }, { transactionId: 'exchange-1' });
    const saved = query.mock.calls[0][1];
    expect(saved[2]).toMatch(/^Pickup (confirmed|complete)$/);
    expect(saved[3]).toContain('Garden tools');
    expect(saved[3]).toContain('Tap to view your exchange.');
    expect(saved[3]).not.toMatch(/in your hands|remember to return|item is yours/i);
  });
  it('describes a declined request without claiming that its item is unavailable', async () => {
    await sendNotification('neighbor-1', 'request_declined', { itemTitle: 'Drill' }, { transactionId: 'exchange-1' });
    const saved = query.mock.calls[0][1];
    expect(saved[2]).toBe('Request declined');
    expect(saved[3]).toBe('Your request for Drill was declined. Tap to view your request.');
    expect(saved[5]).toBe('exchange-1');
  });
  it('welcomes a verified user without claiming neighborhood approval', async () => {
    await sendNotification('neighbor-1', 'join_approved', { communityName: 'Borrowhood' });
    const saved = query.mock.calls[0][1];
    expect(saved[2]).toBe('Welcome to Borrowhood');
    expect(saved[3]).toContain('Tap to see nearby items.');
    expect(saved[3]).not.toMatch(/approved to join/);
  });
  it('fixes historical action prompts and recipient wording on read', () => {
    expect(currentNotificationBody('request_declined', "Drill isn't available right now. Tap to browse similar items nearby."))
      .toBe('Your request for Drill was declined. Tap to view your request.');
    expect(currentNotificationBody('pickup_confirmed', 'Drill is now in your hands. Remember to return it by 9/15/2026. Tap to view details.'))
      .toBe('Drill has been picked up. Return due 9/15/2026. Tap to view details.');
    expect(currentNotificationTitle('pickup_confirmed', 'Enjoy your borrow!')).toBe('Pickup confirmed');
    expect(currentNotificationTitle('giveaway_complete', 'Item is Yours!')).toBe('Pickup complete');
    expect(currentNotificationBody('new_message', 'Drill is now in your hands.')).toBe('Drill is now in your hands.');
  });
});
