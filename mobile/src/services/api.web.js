import { PROJECTS, matchesProjectItem, seasonalProjects } from '../preview/projectIdeas';
// The browser target is a local design preview. It never imports the live API.
// Native iOS/Android continue resolving api.js.
import { emptyPreview, previewUser, previewRequest, previewExchanges, listings, conversation, messages, neighbor, comments, commentReplies } from '../preview/fixtures';

let saved = emptyPreview ? [] : [listings[0]];
let chat = emptyPreview ? [] : [...messages];
let discussion = emptyPreview ? [] : [...comments];
let replies = emptyPreview ? [] : [...commentReplies];
let profileBlocked = false;
const projectExamples = ['Folding table', 'Folding chairs', 'Cooler'].map((title,n)=>({...listings[0],id:`preview-project-${n}`,title,description:'Sample item for the project preview.',photoUrl:null,photos:[],listingType:'lend',isFree:true}));
const available = emptyPreview ? [] : [...listings,...projectExamples];
const requestQuery = new URLSearchParams(window.location.search);
let requestOffers = emptyPreview ? [] : [{ id: listings[0].id, title: 'Cordless drill with a full set of bits and a spare battery', photoUrl: listings[0].photoUrl, isOwn: true }];
const noop = async () => ({});
let projects = [];
const projectIdeas = () => seasonalProjects(new Date(),previewUser).sort((a,b)=>b.seasonPriority-a.seasonPriority).map(p=>({...p,items:p.items.map(i=>({...i,matches:available.filter(l=>matchesProjectItem(l.title,i.terms))}))}));
const api = {
  getProjectIdeas: async () => projectIdeas(),
  getProjects: async () => projects,
  getProject: async id => projects.find(p=>p.id===id),
  createProject: async ({templateId='custom',name,items}) => { const existing=projects.find(p=>p.templateId===templateId&&(templateId!=='custom'||p.name.toLowerCase()===name.toLowerCase()));if(existing)return existing;const template=projectIdeas().find(p=>p.id===templateId)||{name,items:[]};const p={...template,templateId,id:`project-${Date.now()}`,items:(items||template.items).map((i,n)=>({...template.items.find(t=>t.label===i.label),...i,id:`item-${Date.now()}-${n}`,icon:i.icon||'basket',matches:template.items.find(t=>t.label===i.label)?.matches||[],owned:!!i.owned}))};projects=[p,...projects];return p; },
  updateProjectItem: async (id,itemId,data) => {const p=projects.find(p=>p.id===id);p.items=p.items.map(i=>i.id===itemId?{...i,...data}:i);},
  resetProjectItem: async (id,itemId) => {const p=projects.find(p=>p.id===id);p.items=p.items.map(i=>i.id===itemId?{...i,transactionId:null,transactionStatus:null}:i);},
  linkProjectExchange: async (id,itemId,transactionId) => {const exchange=previewExchanges.find(t=>t.id===transactionId);const p=projects.find(p=>p.id===id);p.items=p.items.map(i=>i.id===itemId?{...i,transactionId,transactionStatus:exchange.status,endDate:exchange.endDate}:i);},
  addProjectItem: async (id,{label}) => {projects.find(p=>p.id===id).items.push({id:`item-${Date.now()}`,label,icon:'basket',matches:[],owned:false});},
  deleteProject: async id => {projects=projects.filter(p=>p.id!==id);},
  deleteProjectItem: async (id,itemId) => {const p=projects.find(p=>p.id===id);p.items=p.items.filter(i=>i.id!==itemId);},
  getMe: async () => previewUser,
  getUser: async id => id === previewUser.id ? previewUser : { ...(comments.find(post => post.user.id === id)?.user || neighbor), friendship: { status: 'none' } },
  getUserSafety: async () => ({ blocked: profileBlocked }),
  blockUser: async () => { profileBlocked = true; return { blocked: true }; },
  unblockUser: async () => { profileBlocked = false; return { blocked: false }; },
  reportUser: noop,
  addFriend: async () => ({ status: 'pending' }),
  getFeed: async (params = {}) => ({ items: available.filter(item =>
    (!params.search || `${item.title} ${item.description}`.toLowerCase().includes(params.search.toLowerCase())) &&
    (!params.categoryId || params.categoryId.split(',').includes(item.categoryId)) &&
    (!params.type || params.type.split(',').some(type => type === 'listings' ? item.listingType !== 'giveaway' : type === 'giveaway' && item.listingType === 'giveaway'))
  ), hasMore: false }),
  getCategories: async () => [{ id: 'tools', name: 'Tools', icon: 'hammer' }, { id: 'outdoors', name: 'Outdoors', icon: 'bonfire' }, { id: 'other', name: 'Other', icon: 'basket' }],
  getCommunities: async () => [{ id: 'preview-town', name: 'Maplewood' }],
  getMyListings: async () => available.slice(1),
  getMyRequests: async () => [],
  getTransactions: async (params = {}) => emptyPreview ? [] : previewExchanges.filter(exchange => !params.role
    || (params.role === 'borrower' ? exchange.isBorrower : !exchange.isBorrower)),
  getDisputes: async () => [],
  getSavedListings: async () => [...saved],
  checkSaved: async id => ({ isSaved: saved.some(item => item.id === id) }),
  saveListing: async id => { if (!saved.some(item => item.id === id)) saved = [...saved, listings.find(item => item.id === id)].filter(Boolean); },
  unsaveListing: async id => { saved = saved.filter(item => item.id !== id); },
  getListing: async id => available.find(item => item.id === id),
  getRequest: async () => ({ ...previewRequest,
    status: requestQuery.get('requestState') === 'closed' ? 'closed' : 'open',
    isExpired: requestQuery.get('requestState') === 'expired',
    isOwner: requestQuery.has('requestOwner'),
  }),
  getRequestOffers: async () => [...requestOffers],
  withdrawOffer: async (_requestId, listingId) => { requestOffers = requestOffers.filter(offer => offer.id !== listingId); },
  getDiscussions: async () => ({ posts: [...discussion], total: discussion.length }),
  getDiscussionReplies: async () => ({ replies: [...replies] }),
  createDiscussionPost: async (_listingId, { content, parentId }) => {
    const post = { id: `preview-comment-${Date.now()}`, content, user: previewUser, isOwn: true, replyCount: 0, createdAt: new Date().toISOString() };
    if (parentId) { replies = [...replies, post]; discussion = discussion.map(root => root.id === parentId ? { ...root, replyCount: root.replyCount + 1 } : root); }
    else discussion = [post, ...discussion];
    return post;
  },
  deleteDiscussionPost: async (_listingId, postId) => {
    discussion = discussion.filter(post => post.id !== postId);
    replies = replies.filter(post => post.id !== postId);
  },
  getRequestDiscussions: async () => ({ posts: [], total: 0 }),
  getBadgeCount: async () => ({ messages: 0, notifications: emptyPreview ? 0 : 1, actions: 0, total: emptyPreview ? 0 : 1 }),
  getNotifications: async () => ({ notifications: emptyPreview ? [] : [{ id: 'preview-notification', type: 'new_message', title: 'Jamie sent you a message', body: 'Saturday morning works for the drill.', createdAt: new Date().toISOString(), conversationId: conversation.id, isRead: false }], unreadCount: emptyPreview ? 0 : 1 }),
  getConversations: async () => emptyPreview ? [] : [conversation],
  getMessageCapabilities: async () => ({ idempotentMessages: false }),
  getConversation: async () => ({ conversation, messages: [...chat] }),
  sendMessage: async ({ content }) => {
    const message = { id: `preview-message-${Date.now()}`, conversationId: conversation.id, content, senderId: previewUser.id, isOwnMessage: true, createdAt: new Date().toISOString(), reactions: [] };
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
