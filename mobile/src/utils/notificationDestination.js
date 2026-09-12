import { publicReplyRoute } from './conversationContext';

const inbox = (tab = 'activity') => ({ name: 'Main', params: { screen: 'Activity', params: { tab } } });

// Push alerts and Inbox rows lead to the same place. Older alerts with missing
// context still open a useful screen instead of becoming a dead tap.
export function notificationDestination(item = {}) {
  if (item.type === 'item_match') return null;

  const discussion = publicReplyRoute(item);
  if (discussion) return { name: 'ListingDiscussion', params: discussion };
  if (item.queueListingId || (['borrow_request', 'giveaway_claim'].includes(item.type) && item.listingId)) {
    return { name: 'RequestQueue', params: { listingId: item.queueListingId || item.listingId } };
  }
  if (item.type === 'new_message') return item.conversationId
    ? { name: 'Chat', params: { conversationId: item.conversationId } } : inbox('messages');
  if (['new_request', 'request_offer'].includes(item.type) && item.requestId) {
    return { name: 'RequestDetail', params: { id: item.requestId } };
  }
  if (['friend_request', 'friend_accepted'].includes(item.type)) return { name: 'Friends' };
  if (item.type === 'referral_joined') return item.fromUserId
    ? { name: 'UserProfile', params: { id: item.fromUserId } } : { name: 'Friends' };
  if (['rank_up', 'rank_down', 'rank_ready', 'new_rating', 'rating_received'].includes(item.type)) {
    return { name: 'Main', params: { screen: 'Profile', params: { openRating: true } } };
  }
  if (item.type === 'join_approved') return { name: 'Main', params: { screen: 'Feed' } };
  if (item.type === 'join_request') return item.communityId
    ? { name: 'CommunityMembers', params: { id: item.communityId } } : { name: 'MyCommunity' };
  if (item.type === 'verification_expiring') return { name: 'IdentityVerification', params: { source: 'generic' } };
  if (item.disputeId) return { name: 'DisputeDetail', params: { id: item.disputeId } };
  if (item.transactionId) return { name: 'TransactionDetail', params: { id: item.transactionId } };
  if (item.listingId) return { name: 'ListingDetail', params: { id: item.listingId } };
  if (item.type === 'payment_failed') return { name: 'SetupPayout' };
  return inbox();
}
