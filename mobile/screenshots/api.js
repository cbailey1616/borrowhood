import { user, listings, requests, conversation, messages, reviewExchanges } from './fixtures';
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
  isLender: true, position: index + 1, canChoose: captureScreen !== 'reserved-queue', message: index === 0 ? 'Could I pick it up this afternoon?' : 'Tomorrow morning works for me.', createdAt: new Date(Date.now() - (2-index)*60000).toISOString(),
}));
const ownerItemWaiting = waiting.map((item, index) => ({ ...item, id: `demo-tent-queue-${index}`,
  listing: listings[3], listingType: 'lend', borrower: listings[index === 0 ? 2 : 1].owner,
  startDate: reviewExchanges[1].startDate, endDate: reviewExchanges[1].endDate, rentalDays: 2,
  canChoose: false, queue: { waiting: true } }));
const notices = waiting.map(item => ({ id: `demo-notice-${item.id}`, type: 'giveaway_claim', transactionId: item.id, listingId: item.listing.id,
  title: 'New request', body: `${item.borrower.firstName} requested your item`, fromUser: item.borrower, fromUserId: item.borrower.id,
  isRead: false, createdAt: item.createdAt }));
const readNoticeIds = new Set();
let conversationRead = false;
const reviewTransactions = () => captureScreen === 'home-exchanges' ? [reviewExchanges[0], waiting[0]]
  : captureScreen === 'owner-pickup' ? [reviewExchanges[1]]
  : captureScreen === 'owner-active-item' ? [reviewExchanges[2], ...ownerItemWaiting]
  : captureScreen === 'inbox' ? waiting : [];
const activityNotices = () => {
  const source = captureScreen === 'inbox' ? notices : captureScreen === 'home-exchanges' ? notices.slice(0, 1) : [];
  if (!source.length) return [];
  const latest = source[source.length - 1];
  // Match the live API's grouped queue records, unread counts, and read IDs.
  return [{ ...latest, queueListingId: latest.listingId, listingTitle: listings[4].title,
    requestCount: source.length, notificationIds: source.map(item => item.id),
    title: source.length > 1 ? `${source.length} people requested ${listings[4].title}` : `${latest.fromUser.firstName} requested ${listings[4].title}`,
    body: 'See queue', fromUser: source.length > 1 ? null : latest.fromUser,
    isRead: source.every(item => readNoticeIds.has(item.id)) }];
};
const unreadMessages = () => !conversationRead && ['inbox', 'inbox-messages'].includes(captureScreen) ? 2 : 0;
const fixtureConversation = () => ({ ...conversation, unreadCount: unreadMessages(),
  ...(captureScreen === 'inbox-messages' ? { lastMessage: 'I can bring the drill over tomorrow morning.' } : {}) });
const photoRequest = { ...requests[0], id: 'demo-photo-request', title: 'A cordless drill for a weekend project', description: 'Putting up shelves. Happy to collect it.', requestType: 'item', photoUrl: listings[0].photoUrl };
const plainRequest = { ...requests[0], id: 'demo-service-request', title: 'Help with dinner', description: '', requestType: 'service' };
const carouselRequests = captureScreen === 'requests-photo' ? [photoRequest, plainRequest] : [plainRequest, photoRequest];
const api = {
  getMe: async () => user,
  getUser: async id => id === user.id ? user : listings.find(item => item.owner.id === id)?.owner,
  getFriends: async () => [],
  getUserSafety: async () => ({ blocked: false }),
  endorseTransaction: async (_id, positive) => { feedback = { canRate: false, submitted: true, positive }; return { success: true }; },
  getTransaction: async id => [...reviewExchanges, ...ownerItemWaiting].find(item => item.id === id) || (waiting.some(item => item.id === id) ? { ...waiting.find(item => item.id === id), queue: { waiting: captureScreen === 'reserved-queue' } } : id === 'demo-pending-exchange' ? {
    id, status: 'pending', listingType: 'giveaway', listing: listings[1],
    borrower: user, lender: listings[1].owner, isBorrower: true, isLender: false,
    queue: { waiting: false }, endorsement: null,
  } : { id: 'demo-exchange', endorsement: feedback }),
  getNotificationPreferences: async () => preferences,
  updateNotificationPreferences: async patch => { preferences = { ...preferences, ...patch }; return preferences; },
  getFeed: async () => captureScreen === 'feed-end' ? { items: [], requests: [plainRequest], hasMore: false } : captureScreen?.startsWith('requests-')
    ? { items: listings, requests: carouselRequests, hasMore: false }
    : { items: [listings[0], requests[0], ...listings.slice(1)], hasMore: false },
  recordFeedEvents: noop,
  getCategories: async () => [{ id: 'tools', name: 'Tools' }, { id: 'outdoors', name: 'Outdoors' }, { id: 'garden', name: 'Garden' }, { id: 'other', name: 'Other' }],
  getCommunities: async () => [{ id: 'demo-town', name: 'Maplewood Neighbors', description: 'Good neighbors. Useful things. A little closer to home.', role: 'member', bannerUrl: listings[3].photoUrl, memberCount: 28, listingCount: 42, transactionCount: 67 }],
  getCommunityMembers: async () => ({ members: [listings[0].owner, listings[2].owner, listings[1].owner, user].map((member, index) => ({ ...member, role: index === 0 ? 'organizer' : 'member' })) }),
  getMyListings: async () => listings.map(item => ({ ...item, owner: user, user, ownerId: user.id })),
  getMyRequests: async () => requests,
  getTransactions: async () => reviewTransactions(),
  getRequestQueue: async id => id === 'demo-tent' ? {
    listing: { ...listings[3], isAvailable: false, availabilityStatus: 'borrowed' },
    requests: ownerItemWaiting, activeTransactionId: 'demo-owner-active',
  } : { listing: captureScreen === 'reserved-queue' ? { ...listings[4], availabilityStatus: 'reserved' } : listings[4],
    requests: captureScreen === 'home-exchanges' ? waiting.slice(0, 1) : waiting,
    activeTransactionId: captureScreen === 'reserved-queue' ? 'demo-active' : null },
  getDisputes: async () => [],
  getSavedListings: async () => [listings[0], listings[3], listings[1], listings[2]],
  checkSaved: async id => ({ saved: ['demo-drill', 'demo-tent', 'demo-books', 'demo-bike'].includes(id) }),
  getListing: async id => {
    const listing = listings.find(item => item.id === id);
    if (captureScreen === 'owner-active-item' && id === 'demo-tent') return {
      ...listing, isOwner: true, isAvailable: false, isBorrowed: true, availabilityStatus: 'borrowed',
      pendingRequests: 2, activeTransaction: reviewExchanges[2],
    };
    return captureScreen === 'reserved-item' ? { ...listing, isAvailable: false, availabilityStatus: 'reserved' } : listing;
  },
  getDiscussions: async () => ({ posts: [], total: 0 }),
  getRequestDiscussions: async () => ({ posts: [], total: 0 }),
  getBadgeCount: async () => {
    const messages = unreadMessages();
    const notifications = activityNotices().filter(item => !item.isRead).length;
    const actions = ['inbox', 'home-exchanges', 'owner-pickup', 'owner-active-item'].includes(captureScreen) ? 1 : 0;
    return { messages, notifications, actions, total: messages + notifications + actions };
  },
  getNotifications: async ({ page = 1, limit = 50, unreadOnly } = {}) => {
    const all = activityNotices();
    const visible = unreadOnly === 'true' ? all.filter(item => !item.isRead) : all;
    return { notifications: visible.slice((page - 1) * limit, page * limit), unreadCount: all.filter(item => !item.isRead).length };
  },
  getConversations: async () => [fixtureConversation()],
  getMessageCapabilities: async () => ({ idempotentMessages: false }),
  getConversation: async () => captureScreen === 'inbox-messages' ? {
    conversation: fixtureConversation(), messages: [...messages, {
      id: 'demo-unread-message', content: fixtureConversation().lastMessage,
      senderId: conversation.otherUser.id, isOwnMessage: false, isRead: conversationRead,
      reactions: [], createdAt: conversation.lastMessageAt,
    }],
  } : { conversation, messages },
  markConversationRead: async () => { conversationRead = true; return { success: true }; },
  markAllNotificationsRead: async () => { notices.forEach(item => readNoticeIds.add(item.id)); return { success: true }; },
  markNotificationRead: async (id, notificationIds) => { (notificationIds || [id]).forEach(value => readNoticeIds.add(value)); return { success: true }; },
};
// The capture bundle cannot import or fall through to the production API.
export default new Proxy(api, { get: (target, name) => name in target ? target[name] : noop });
