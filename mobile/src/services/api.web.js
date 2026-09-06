// The browser target is a local design preview. It never imports the live API.
// Native iOS/Android continue resolving api.js.
import { emptyPreview, previewUser, listings, conversation, messages } from '../preview/fixtures';

let saved = emptyPreview ? [] : [listings[0]];
let chat = emptyPreview ? [] : [...messages];
const available = emptyPreview ? [] : listings;
const noop = async () => ({});
const api = {
  getMe: async () => previewUser,
  getFeed: async (params = {}) => ({ items: available.filter(item =>
    (!params.search || `${item.title} ${item.description}`.toLowerCase().includes(params.search.toLowerCase())) &&
    (!params.categoryId || params.categoryId.split(',').includes(item.categoryId)) &&
    (!params.type || params.type.split(',').some(type => type === 'listings' ? item.listingType !== 'giveaway' : type === 'giveaway' && item.listingType === 'giveaway'))
  ), hasMore: false }),
  getCategories: async () => [{ id: 'tools', name: 'Tools', icon: 'hammer' }, { id: 'outdoors', name: 'Outdoors', icon: 'bonfire' }, { id: 'other', name: 'Other', icon: 'basket' }],
  getCommunities: async () => [{ id: 'preview-town', name: 'Maplewood' }],
  getMyListings: async () => available.slice(1),
  getMyRequests: async () => [],
  getTransactions: async () => [],
  getDisputes: async () => [],
  getSavedListings: async () => [...saved],
  checkSaved: async id => ({ isSaved: saved.some(item => item.id === id) }),
  saveListing: async id => { if (!saved.some(item => item.id === id)) saved = [...saved, listings.find(item => item.id === id)].filter(Boolean); },
  unsaveListing: async id => { saved = saved.filter(item => item.id !== id); },
  getListing: async id => listings.find(item => item.id === id),
  getDiscussions: async () => ({ posts: [], total: 0 }),
  getRequestDiscussions: async () => ({ posts: [], total: 0 }),
  getBadgeCount: async () => ({ messages: 0, notifications: emptyPreview ? 0 : 1, actions: 0, total: emptyPreview ? 0 : 1 }),
  getNotifications: async () => ({ notifications: emptyPreview ? [] : [{ id: 'preview-notification', type: 'new_message', title: 'Jamie sent you a message', body: 'Saturday morning works for the drill.', createdAt: new Date().toISOString(), conversationId: conversation.id, isRead: false }], unreadCount: emptyPreview ? 0 : 1 }),
  getConversations: async () => emptyPreview ? [] : [conversation],
  getMessageCapabilities: async () => ({ idempotentMessages: false }),
  getConversation: async () => ({ conversation, messages: [...chat] }),
  sendMessage: async ({ content }) => {
    const message = { id: `preview-message-${Date.now()}`, conversationId: conversation.id, content, senderId: previewUser.id, isOwnMessage: true, isRead: false, createdAt: new Date().toISOString(), reactions: [] };
    chat = [...chat, message];
    return message;
  },
  deleteMessage: async id => { chat = chat.filter(message => message.id !== id); },
  markConversationRead: noop, markAllNotificationsRead: noop, markNotificationRead: noop,
};
export default new Proxy(api, {
  get(target, name) {
    if (name in target) return target[name];
    return async () => { throw new Error('This action needs the iPhone app. This preview uses sample data.'); };
  },
});
