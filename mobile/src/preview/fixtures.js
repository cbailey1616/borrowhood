import { iconSvg } from '../assets/borrowhood-icons';

export const emptyPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('empty');
const artwork = name => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(name, { illustrated: true }))}`;
export const previewUser = {
  id: 'preview-you', firstName: 'Alex', lastName: 'Green', displayName: 'Alex Green',
  email: 'alex@example.com', isVerified: true, totalTransactions: 38,
  onboardingCompleted: true, town: 'Maplewood', townName: 'Maplewood',
  profilePhotoUrl: artwork('person'), subscriptionTier: 'free',
};
export const neighbor = { id: 'preview-neighbor', firstName: 'Jamie', lastName: 'Miller', isVerified: true, totalTransactions: 14, profilePhotoUrl: artwork('person'), city: 'Maplewood', state: 'NJ', bio: 'A few spare tools and always happy to help a neighbor.', friendship: { status: 'none' } };
export const previewRequest = {
  id: 'preview-request', title: 'A cordless drill for the weekend', description: 'Putting up a few shelves. A drill and a set of bits would be perfect.',
  type: 'item', status: 'open', category: 'Tools & hardware', photoUrl: artwork('hammer'),
  neededFrom: '2026-09-18', neededUntil: '2026-09-20', createdAt: '2026-09-16T12:00:00Z',
  requester: { ...neighbor, endorsement: { completedCount: 6, score: 85 } }, isOwner: false,
};
export const listings = [
  { id: 'preview-drill', title: 'Cordless drill & bits', description: 'For that little weekend project. Happy to lend the full kit.', categoryId: 'tools', icon: 'hammer', user: neighbor },
  { id: 'preview-camping', title: 'Camping kit for two', description: 'A tent, two chairs, and a little fresh air. Ready for your next trip.', categoryId: 'outdoors', icon: 'bonfire', user: { ...neighbor, firstName: 'Sam', totalTransactions: 4 } },
  { id: 'preview-books', title: 'A few good reads', description: 'Finished these and would love to pass them along.', categoryId: 'other', icon: 'document-text', listingType: 'giveaway', user: { ...neighbor, firstName: 'Taylor', totalTransactions: 82 } },
].map(item => ({ type: 'listing', listingType: 'lend', isFree: true, isAvailable: true, condition: 'good', visibility: 'neighborhood', createdAt: new Date().toISOString(), ...item, owner: item.user, ownerId: item.user.id, photoUrl: artwork(item.icon), photos: [artwork(item.icon)] }));
export const conversation = { id: 'preview-chat', otherUser: neighbor, listing: listings[0], lastMessage: 'Perfect, see you then!', lastMessageAt: new Date().toISOString(), unreadCount: 0 };
export const messages = [
  { id: 'preview-message-1', content: 'About item: “Cordless drill & bits”\n\nHi Jamie! Could I borrow this on Saturday?', senderId: previewUser.id, isOwnMessage: true },
  { id: 'preview-message-2', content: 'Of course! A little weekend project?', senderId: neighbor.id, isOwnMessage: false },
  { id: 'preview-message-3', content: 'Finally putting those shelves up 😄', senderId: previewUser.id, isOwnMessage: true },
  { id: 'preview-message-4', content: 'I’ll put the bits in the case too.', senderId: neighbor.id, isOwnMessage: false },
  { id: 'preview-message-5', content: 'Would 10 work for pickup?', senderId: neighbor.id, isOwnMessage: false },
  { id: 'preview-message-6', content: 'Perfect. Thanks, Jamie!', senderId: previewUser.id, isOwnMessage: true },
].map((message, index) => ({ ...message, isRead: true, reactions: [], createdAt: new Date(Date.now() - (6 - index) * 60000).toISOString() }));

export const comments = [
  { id: 'preview-comment-1', content: 'Does it come with a masonry bit? Hoping to put up a shelf this weekend.', user: { ...neighbor, id: 'preview-sam', firstName: 'Sam', lastName: 'Rivera' }, replyCount: 2, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'preview-comment-2', content: 'Borrowed this last week. Made my little project so much easier. Thank you!', user: { ...neighbor, id: 'preview-taylor', firstName: 'Taylor', lastName: 'Reed' }, replyCount: 0, createdAt: new Date(Date.now() - 86400000).toISOString() },
];
export const commentReplies = [
  { id: 'preview-reply-1', content: 'It does! There’s a full set in the case.', user: neighbor, createdAt: new Date(Date.now() - 3000000).toISOString() },
  { id: 'preview-reply-2', content: 'Lovely, I’ll send you a message.', user: comments[0].user, createdAt: new Date(Date.now() - 2400000).toISOString() },
];
