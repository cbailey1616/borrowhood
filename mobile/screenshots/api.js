import { user, listings, requests, conversation, messages } from './fixtures';
const noop = async () => ({});
const api = {
  getMe: async () => user,
  getFeed: async () => ({ items: [listings[0], requests[0], ...listings.slice(1)], hasMore: false }),
  recordFeedEvents: noop,
  getCategories: async () => [{ id: 'tools', name: 'Tools' }, { id: 'outdoors', name: 'Outdoors' }, { id: 'garden', name: 'Garden' }, { id: 'other', name: 'Other' }],
  getCommunities: async () => [{ id: 'demo-town', name: 'Maplewood' }],
  getMyListings: async () => listings.map(item => ({ ...item, owner: user, user, ownerId: user.id })),
  getMyRequests: async () => requests,
  getTransactions: async () => [],
  getDisputes: async () => [],
  getSavedListings: async () => [listings[0], listings[3], listings[1], listings[2]],
  checkSaved: async id => ({ isSaved: ['demo-drill', 'demo-tent'].includes(id) }),
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
