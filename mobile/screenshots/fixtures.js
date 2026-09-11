import { Image } from 'react-native';
const avatar = null;
const photo = asset => Image.resolveAssetSource(asset).uri;
const photos = {
  drill: photo(require('./assets/drill.jpg')),
  tent: photo(require('./assets/tent.jpg')),
  books: photo(require('./assets/books.jpg')),
  bike: photo(require('./assets/bike.jpg')),
  plants: photo(require('./assets/plants.jpg')),
};
export const user = { id: 'demo-alex', firstName: 'Alex', lastName: 'Green', displayName: 'Alex Green', email: 'alex@example.com', isVerified: true, totalTransactions: 18, onboardingCompleted: true, town: 'Maplewood', townName: 'Maplewood', city: 'Maplewood', state: 'NJ', latitude: 40.73, longitude: -74.27, profilePhotoUrl: avatar, subscriptionTier: 'free', rating: 4.9, ratingCount: 12 };
user.endorsement = { count: 6, percent: 100, score: 89 };
const jamie = { ...user, id: 'demo-jamie', firstName: 'Jamie', lastName: 'Miller', displayName: 'Jamie Miller', totalTransactions: 24, endorsement: { count: 20, percent: 100, score: 95 } };
const sam = { ...user, id: 'demo-sam', firstName: 'Sam', lastName: 'Rivera', displayName: 'Sam Rivera', totalTransactions: 8 };
const taylor = { ...user, id: 'demo-taylor', firstName: 'Taylor', lastName: 'Reed', displayName: 'Taylor Reed', totalTransactions: 27 };
export const listings = [
  { id: 'demo-drill', title: 'Cordless drill & bits', description: 'Everything you need for a little weekend project. Happy to lend the drill and full bit set.', categoryId: 'tools', owner: jamie, photoUrl: photos.drill },
  { id: 'demo-books', title: 'A few good reads', description: 'A stack of books ready for a new home. Take one or take them all — free to keep.', categoryId: 'other', owner: taylor, photoUrl: photos.books, listingType: 'giveaway' },
  { id: 'demo-bike', title: 'Weekend city bike', description: 'A comfortable bike for rides around town. Recently serviced and ready for its next adventure.', categoryId: 'outdoors', owner: sam, photoUrl: photos.bike, listingType: 'sell', isFree: false, directFee: { amount: 60, unit: 'flat', currency: 'USD' } },
  { id: 'demo-tent', title: 'Tent for your next adventure', description: 'Easy to pack, easy to pitch. Borrow it for a weekend under the stars.', categoryId: 'outdoors', owner: user, photoUrl: photos.tent },
  { id: 'demo-plants', title: 'Garden trowel & shears', description: 'A spare trowel and pruning shears. Free to a neighbor with a green thumb.', categoryId: 'garden', owner: user, photoUrl: photos.plants, listingType: 'giveaway' },
].map((item, index) => ({ type: 'listing', status: 'active', listingType: 'lend', isFree: true, isAvailable: true, isBorrowed: false, condition: 'good', visibility: 'neighborhood', pricePerDay: 0, timesBorrowed: !item.listingType || item.listingType === 'lend' ? 3 + index : 0, pendingRequests: 0, maxBorrowDays: 14, minBorrowDays: 1, createdAt: new Date(Date.now() - (index + 1) * 3600000).toISOString(), ...item, user: item.owner, ownerId: item.owner.id, photos: [item.photoUrl] }));
export const requests = [{ id: 'demo-request', type: 'request', title: 'Does anyone have a ladder?', description: 'Just need one for a little gardening this weekend. Happy to pick it up!', status: 'open', visibility: 'neighborhood', user: sam, userId: sam.id, createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), responseCount: 2 }];
export const conversation = { id: 'demo-chat', otherUser: jamie, listing: listings[0], listingId: listings[0].id, lastMessage: 'Perfect, see you Saturday!', lastMessageAt: new Date().toISOString(), unreadCount: 0 };
const messageClock = new Date();
messageClock.setHours(9, 40, 0, 0);
export const messages = [
  { content: 'Hi Jamie! Could I borrow your drill this weekend?', senderId: user.id, isOwnMessage: true },
  { content: 'Of course! Saturday morning works. I’ll put the bits in the case too.', senderId: jamie.id, isOwnMessage: false },
  { content: 'Thank you! I can pick it up around 10 and bring it back Sunday.', senderId: user.id, isOwnMessage: true },
  { content: 'That works for me. Happy to help with the project!', senderId: jamie.id, isOwnMessage: false },
  { content: 'Perfect, see you Saturday!', senderId: user.id, isOwnMessage: true },
].map((message, index) => ({ id: `demo-message-${index}`, ...message, isRead: true, reactions: [], createdAt: new Date(messageClock.getTime() - (6 - index) * 60000).toISOString() }));
