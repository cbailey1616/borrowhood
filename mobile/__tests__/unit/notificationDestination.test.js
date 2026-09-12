import { notificationDestination } from '../../src/utils/notificationDestination';

describe('notification destinations', () => {
  it.each(['borrow_request', 'giveaway_claim'])('opens %s in the one approval queue', type => {
    expect(notificationDestination({ type, transactionId: 'exchange', listingId: 'item' }))
      .toEqual({ name: 'RequestQueue', params: { listingId: 'item' } });
  });

  it.each(['request_approved', 'request_declined', 'borrow_cancelled', 'pickup_confirmed',
    'return_confirmed', 'giveaway_complete', 'giveaway_expired', 'giveaway_pickup_expired', 'return_reminder'])
  ('keeps %s linked to the affected exchange', type => {
    expect(notificationDestination({ type, transactionId: 'exchange', listingId: 'item' }))
      .toEqual({ name: 'TransactionDetail', params: { id: 'exchange' } });
  });

  it('opens a private offer in the request and a public reply in its public thread', () => {
    expect(notificationDestination({ type: 'request_offer', requestId: 'request', listingId: 'item' }))
      .toEqual({ name: 'RequestDetail', params: { id: 'request' } });
    expect(notificationDestination({ type: 'discussion_reply', requestId: 'request', listingId: 'item' }))
      .toEqual({ name: 'ListingDiscussion', params: { requestId: 'request' } });
  });

  it('takes welcome alerts to nearby items and tier alerts to the existing Profile tab', () => {
    expect(notificationDestination({ type: 'join_approved' })).toEqual({ name: 'Main', params: { screen: 'Feed' } });
    for (const type of ['rank_up', 'rank_down', 'rank_ready', 'new_rating', 'rating_received']) {
      expect(notificationDestination({ type })).toEqual({ name: 'Main', params: { screen: 'Profile', params: { openRating: true } } });
    }
  });

  it('opens useful destinations when older alerts lack context', () => {
    expect(notificationDestination({ type: 'new_message' }))
      .toEqual({ name: 'Main', params: { screen: 'Activity', params: { tab: 'messages' } } });
    expect(notificationDestination({ type: 'join_request' })).toEqual({ name: 'MyCommunity' });
    expect(notificationDestination({ type: 'referral_joined', fromUserId: 'neighbor' }))
      .toEqual({ name: 'UserProfile', params: { id: 'neighbor' } });
    expect(notificationDestination({ type: 'return_reminder' }))
      .toEqual({ name: 'Main', params: { screen: 'Activity', params: { tab: 'activity' } } });
    expect(notificationDestination({ type: 'item_match', listingId: 'item' })).toBeNull();
  });
});
