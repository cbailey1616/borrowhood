import { iconSvg } from '../assets/borrowhood-icons';

export const emptyPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('empty');
const artwork = name => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(name, { illustrated: true }))}`;
export const previewUser = {
  id: 'preview-you', firstName: 'Alex', lastName: 'Green', displayName: 'Alex Green',
  email: 'alex@example.com', isVerified: true, totalTransactions: 38,
  onboardingCompleted: true, town: 'Maplewood', townName: 'Maplewood',
  profilePhotoUrl: artwork('person'), subscriptionTier: 'free',
};
const neighbor = { id: 'preview-neighbor', firstName: 'Jamie', lastName: 'Miller', isVerified: true, totalTransactions: 14, profilePhotoUrl: artwork('person') };
export const listings = [
  { id: 'preview-drill', title: 'Cordless drill & bits', description: 'For that little weekend project. Happy to lend the full kit.', categoryId: 'tools', icon: 'hammer', user: neighbor },
  { id: 'preview-camping', title: 'Camping kit for two', description: 'A tent, two chairs, and a little fresh air. Ready for your next trip.', categoryId: 'outdoors', icon: 'bonfire', user: { ...neighbor, firstName: 'Sam', totalTransactions: 4 } },
  { id: 'preview-books', title: 'A few good reads', description: 'Finished these and would love to pass them along.', categoryId: 'other', icon: 'document-text', listingType: 'giveaway', user: { ...neighbor, firstName: 'Taylor', totalTransactions: 82 } },
].map(item => ({ type: 'listing', listingType: 'lend', isFree: true, isAvailable: true, condition: 'good', visibility: 'neighborhood', createdAt: new Date().toISOString(), ...item, owner: item.user, ownerId: item.user.id, photoUrl: artwork(item.icon), photos: [artwork(item.icon)] }));
export const conversation = { id: 'preview-chat', otherUser: neighbor, listing: listings[0], lastMessage: 'Perfect, see you then!', lastMessageAt: new Date().toISOString(), unreadCount: 0 };
export const messages = [
  { id: 'preview-message-1', content: 'Hi Jamie! Could I borrow your drill this weekend?', senderId: previewUser.id, isOwnMessage: true },
  { id: 'preview-message-2', content: 'Of course! Saturday morning works. I’ll leave the bits in the case too.', senderId: neighbor.id, isOwnMessage: false },
  { id: 'preview-message-3', content: 'Perfect, see you then!', senderId: previewUser.id, isOwnMessage: true },
].map((message, index) => ({ ...message, isRead: true, reactions: [], createdAt: new Date(Date.now() - (3 - index) * 60000).toISOString() }));
