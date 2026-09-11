import { user, listings, requests, conversation, messages } from './fixtures';
import { Settings } from 'react-native';
const noop = async () => ({});
let feedback = { canRate: true };
let preferences = {
  push_enabled: true, push_sound: true,
  new_item_requests_source_friends: true, new_item_requests_source_neighborhood: true, new_item_requests_source_town: false,
  new_service_requests_source_friends: true, new_service_requests_source_neighborhood: false, new_service_requests_source_town: false,
};
const captureScreen = Settings.get('BorrowhoodCaptureScreen');
const waiting = [listings[0].owner, { ...listings[2].owner, isVerified: false }].map((borrower, index) => ({
  id: `demo-queue-${index}`, status: 'pending', listingType: 'giveaway', listing: listings[4], borrower, lender: user, isBorrower: false,
  position: index + 1, canChoose: true, createdAt: new Date(Date.now() - (2-index)*60000).toISOString(),
}));
const notices = waiting.map(item => ({ id: `demo-notice-${item.id}`, type: 'giveaway_claim', transactionId: item.id, listingId: item.listing.id,
  title: 'New request', body: `${item.borrower.firstName} requested your item`, fromUser: item.borrower, fromUserId: item.borrower.id,
  isRead: false, createdAt: item.createdAt }));
const photoRequest = { ...requests[0], id: 'demo-photo-request', title: 'A cordless drill for a weekend project', description: 'Putting up shelves. Happy to collect it.', requestType: 'item', photoUrl: listings[0].photoUrl };
const plainRequest = { ...requests[0], id: 'demo-service-request', title: 'Help with dinner', description: '', requestType: 'service' };
const carouselRequests = captureScreen === 'requests-photo' ? [photoRequest, plainRequest] : [plainRequest, photoRequest];
const api = {
  getMe: async () => user,
  getUser: async id => id === user.id ? user : listings.find(item => item.owner.id === id)?.owner,
  getFriends: async () => [],
  getUserSafety: async () => ({ blocked: false }),
  endorseTransaction: async (_id, positive) => { feedback = { canRate: false, submitted: true, positive }; return { success: true }; },
  getTransaction: async id => id === 'demo-pending-exchange' ? {
    id, status: 'pending', listingType: 'giveaway', listing: listings[1],
    borrower: user, lender: listings[1].owner, isBorrower: true, isLender: false,
    queue: { waiting: false }, endorsement: null,
  } : { id: 'demo-exchange', endorsement: feedback },
  getNotificationPreferences: async () => preferences,
  updateNotificationPreferences: async patch => { preferences = { ...preferences, ...patch }; return preferences; },
  getFeed: async () => captureScreen === 'feed-end' ? { items: [], requests: [plainRequest], hasMore: false } : captureScreen?.startsWith('requests-')
    ? { items: listings, requests: carouselRequests, hasMore: false }
    : { items: [listings[0], requests[0], ...listings.slice(1)], hasMore: false },
  recordFeedEvents: noop,
  getCategories: async () => [{ id: 'tools', name: 'Tools' }, { id: 'outdoors', name: 'Outdoors' }, { id: 'garden', name: 'Garden' }, { id: 'other', name: 'Other' }],
  getCommunities: async () => [{ id: 'demo-town', name: 'Maplewood' }],
  getMyListings: async () => listings.map(item => ({ ...item, owner: user, user, ownerId: user.id })),
  getMyRequests: async () => requests,
  getTransactions: async () => captureScreen === 'inbox' ? waiting : [],
  getRequestQueue: async () => ({ listing: listings[4], requests: waiting }),
  getDisputes: async () => [],
  getSavedListings: async () => [listings[0], listings[3], listings[1], listings[2]],
  checkSaved: async id => ({ saved: ['demo-drill', 'demo-tent', 'demo-books', 'demo-bike'].includes(id) }),
  getListing: async id => {
    const listing = listings.find(item => item.id === id);
    return captureScreen === 'reserved-item' ? { ...listing, isAvailable: false, availabilityStatus: 'reserved' } : listing;
  },
  getDiscussions: async () => ({ posts: [], total: 0 }),
  getRequestDiscussions: async () => ({ posts: [], total: 0 }),
  getBadgeCount: async () => captureScreen === 'inbox' ? { messages: 2, notifications: 1, actions: 1, total: 4 } : { messages: 0, notifications: 0, actions: 0, total: 0 },
  getNotifications: async () => captureScreen === 'inbox' ? { notifications: notices, unreadCount: 2 } : { notifications: [], unreadCount: 0 },
  getConversations: async () => [{ ...conversation, unreadCount: captureScreen === 'inbox' ? 2 : 0 }],
  getMessageCapabilities: async () => ({ idempotentMessages: false }),
  getConversation: async () => ({ conversation, messages }),
  markConversationRead: noop, markAllNotificationsRead: noop, markNotificationRead: noop,
};
// The capture bundle cannot import or fall through to the production API.
export default new Proxy(api, { get: (target, name) => name in target ? target[name] : noop });
