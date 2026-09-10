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
const photoRequest = { ...requests[0], id: 'demo-photo-request', title: 'A cordless drill for a weekend project', description: 'Putting up shelves. Happy to collect it.', requestType: 'item', photoUrl: listings[0].photoUrl };
const plainRequest = { ...requests[0], id: 'demo-service-request', title: 'Help with dinner', description: '', requestType: 'service' };
const carouselRequests = captureScreen === 'requests-photo' ? [photoRequest, plainRequest] : [plainRequest, photoRequest];
const api = {
  getMe: async () => user,
  getUser: async id => id === user.id ? user : listings.find(item => item.owner.id === id)?.owner,
  getFriends: async () => [],
  getUserSafety: async () => ({ blocked: false }),
  endorseTransaction: async (_id, positive) => { feedback = { canRate: false, submitted: true, positive }; return { success: true }; },
  getTransaction: async () => ({ id: 'demo-exchange', endorsement: feedback }),
  getNotificationPreferences: async () => preferences,
  updateNotificationPreferences: async patch => { preferences = { ...preferences, ...patch }; return preferences; },
  getFeed: async () => captureScreen?.startsWith('requests-')
    ? { items: listings, requests: carouselRequests, hasMore: false }
    : { items: [listings[0], requests[0], ...listings.slice(1)], hasMore: false },
  recordFeedEvents: noop,
  getCategories: async () => [{ id: 'tools', name: 'Tools' }, { id: 'outdoors', name: 'Outdoors' }, { id: 'garden', name: 'Garden' }, { id: 'other', name: 'Other' }],
  getCommunities: async () => [{ id: 'demo-town', name: 'Maplewood' }],
  getMyListings: async () => listings.map(item => ({ ...item, owner: user, user, ownerId: user.id })),
  getMyRequests: async () => requests,
  getTransactions: async () => [],
  getDisputes: async () => [],
  getSavedListings: async () => [listings[0], listings[3], listings[1], listings[2]],
  checkSaved: async id => ({ saved: ['demo-drill', 'demo-tent', 'demo-books', 'demo-bike'].includes(id) }),
  getListing: async id => listings.find(item => item.id === id),
  getDiscussions: async () => ({ posts: [], total: 0 }),
  getRequestDiscussions: async () => ({ posts: [], total: 0 }),
  getBadgeCount: async () => ({ messages: 0, notifications: 0, actions: 0, total: 0 }),
  getNotifications: async () => ({ notifications: [], unreadCount: 0 }),
  getConversations: async () => [conversation],
  getMessageCapabilities: async () => ({ idempotentMessages: false }),
  getConversation: async () => ({ conversation, messages }),
  markConversationRead: noop, markAllNotificationsRead: noop, markNotificationRead: noop,
};
// The capture bundle cannot import or fall through to the production API.
export default new Proxy(api, { get: (target, name) => name in target ? target[name] : noop });
