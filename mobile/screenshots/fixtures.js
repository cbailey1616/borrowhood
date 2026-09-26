import { Image } from 'react-native';
const photo = asset => Image.resolveAssetSource(asset).uri;
const avatars = {
  alex: photo(require('./assets/neighbor-alex.jpg')),
  jamie: photo(require('./assets/neighbor-jamie.jpg')),
  sam: photo(require('./assets/neighbor-sam.jpg')),
  taylor: photo(require('./assets/neighbor-taylor.jpg')),
};
const photos = {
  drill: photo(require('./assets/drill.png')),
  tent: photo(require('./assets/tent.jpg')),
  books: photo(require('./assets/books.jpg')),
  bike: photo(require('./assets/bike.jpg')),
  plants: photo(require('./assets/plants.jpg')),
};
export const user = { id: 'demo-alex', firstName: 'Alex', lastName: 'Green', displayName: 'Alex Green', email: 'alex@example.com', isVerified: true, totalTransactions: 18, onboardingCompleted: true, town: 'Maplewood', townName: 'Maplewood', city: 'Maplewood', state: 'NJ', latitude: 40.73, longitude: -74.27, profilePhotoUrl: avatars.alex, subscriptionTier: 'free', rating: 4.9, ratingCount: 12 };
user.endorsement = { count: 6, percent: 100, score: 89 };
const jamie = { ...user, id: 'demo-jamie', profilePhotoUrl: avatars.jamie, firstName: 'Jamie', lastName: 'Miller', displayName: 'Jamie Miller', totalTransactions: 24, endorsement: { count: 20, percent: 100, score: 95 } };
const sam = { ...user, id: 'demo-sam', profilePhotoUrl: avatars.sam, firstName: 'Sam', lastName: 'Rivera', displayName: 'Sam Rivera', totalTransactions: 8 };
const taylor = { ...user, id: 'demo-taylor', profilePhotoUrl: avatars.taylor, firstName: 'Taylor', lastName: 'Reed', displayName: 'Taylor Reed', totalTransactions: 27 };
export const listings = [
  { id: 'demo-drill', title: 'Cordless drill & bits', description: 'Everything you need for a little weekend project. Happy to lend the drill and full bit set.', categoryId: 'tools', owner: jamie, photoUrl: photos.drill },
  { id: 'demo-books', title: 'A few good reads', description: 'A stack of books ready for a new home. Take one or take them all — free to keep.', categoryId: 'other', owner: taylor, photoUrl: photos.books, listingType: 'giveaway' },
  { id: 'demo-bike', title: 'Weekend city bike', description: 'A comfortable bike for rides around town. Recently serviced and ready for its next adventure.', categoryId: 'outdoors', owner: sam, photoUrl: photos.bike, listingType: 'sell', isFree: false, directFee: { amount: 60, unit: 'flat', currency: 'USD' } },
  { id: 'demo-tent', title: 'Tent for your next adventure', description: 'Easy to pack, easy to pitch. Borrow it for a weekend under the stars.', categoryId: 'outdoors', owner: user, photoUrl: photos.tent },
  { id: 'demo-plants', title: 'Garden trowel & shears', description: 'A spare trowel and pruning shears. Free to a neighbor with a green thumb.', categoryId: 'garden', owner: user, photoUrl: photos.plants, listingType: 'giveaway' },
].map((item, index) => ({ type: 'listing', status: 'active', listingType: 'lend', isFree: true, isAvailable: true, isBorrowed: false, condition: 'good', visibility: 'neighborhood', pricePerDay: 0, timesBorrowed: !item.listingType || item.listingType === 'lend' ? 3 + index : 0, pendingRequests: 0, maxBorrowDays: 14, minBorrowDays: 1, createdAt: new Date(Date.now() - (index + 1) * 3600000).toISOString(), ...item, user: item.owner, ownerId: item.owner.id, photos: [item.photoUrl] }));
export const requests = [{ id: 'demo-request', type: 'request', title: 'Does anyone have a ladder?', description: 'Just need one for a little gardening this weekend. Happy to pick it up!', status: 'open', visibility: 'neighborhood', user: sam, userId: sam.id, createdAt: new Date(Date.now() - 2 * 3600000).toISOString(), responseCount: 2 }];
export const conversation = { id: 'demo-chat', otherUser: jamie, listing: listings[0], listingId: listings[0].id, lastMessage: 'Are your garden chairs still available?', lastMessageAt: new Date().toISOString(), unreadCount: 0 };
const dayFromToday = offset => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};
// Usability reviews use the real exchange screens with both sides of a handoff.
export const reviewExchanges = [
  {
    id: 'demo-borrowed-drill', listing: listings[0], listingType: 'lend', status: 'picked_up',
    borrower: user, lender: jamie, isBorrower: true, isLender: false,
    startDate: dayFromToday(-1), endDate: dayFromToday(1), rentalDays: 2,
    actualPickupAt: dayFromToday(-1), conditionAtPickup: 'good', hasDispute: false,
  },
  {
    id: 'demo-owner-pickup', listing: listings[3], listingType: 'lend', status: 'approved',
    borrower: jamie, lender: user, isBorrower: false, isLender: true,
    startDate: dayFromToday(0), endDate: dayFromToday(2), rentalDays: 2,
    actualPickupAt: null, hasDispute: false,
  },
  {
    id: 'demo-owner-active', listing: listings[3], listingType: 'lend', status: 'picked_up',
    borrower: jamie, lender: user, isBorrower: false, isLender: true,
    startDate: dayFromToday(-1), endDate: dayFromToday(1), rentalDays: 2,
    actualPickupAt: dayFromToday(-1), conditionAtPickup: 'good', hasDispute: false,
  },
];
const messageClock = new Date();
messageClock.setHours(9, 40, 0, 0);
export const messages = [
  { content: 'About item: “Cordless drill & bits”\n\nHi Jamie! Could I borrow this on Saturday?', senderId: user.id, isOwnMessage: true },
  { content: 'Of course! Saturday morning works. I’ll put the bits in the case too.', senderId: jamie.id, isOwnMessage: false },
  { content: 'Thank you! I can pick it up around 10 and bring it back Sunday.', senderId: user.id, isOwnMessage: true },
  { content: 'That works for me. Happy to help with the project!', senderId: jamie.id, isOwnMessage: false },
  { content: 'Perfect! Also, are your garden chairs still available?', senderId: user.id, isOwnMessage: true },
].map((message, index) => ({ id: `demo-message-${index}`, ...message, reactions: [], createdAt: new Date(messageClock.getTime() - (6 - index) * 60000).toISOString() }));

export const friends = [jamie, sam, taylor];
// Offline sample neighborhood for the promotional capture. No live membership.
export const neighborhood = {
  id: 'demo-town', name: 'Maplewood', role: 'member', memberCount: 4,
  announcement: 'Have something to share? Post it for your neighbors.',
};
export const neighborhoodChatSummary = {
  unreadCount: 2, lastMessage: 'Does anyone have a ladder for Saturday?',
};
export const neighborhoodMembers = [user, ...friends].map(member => ({
  ...member, role: member.id === taylor.id ? 'organizer' : 'member',
}));
export const comments = [
  { id: 'demo-comment-1', content: 'Does it come with a masonry bit? Hoping to put up a shelf this weekend.', user: sam, createdAt: new Date(Date.now() - 3600000).toISOString(), replyCount: 2 },
  { id: 'demo-comment-2', content: 'Borrowed this last week. Made my little project so much easier. Thank you!', user: taylor, createdAt: new Date(Date.now() - 86400000).toISOString(), replyCount: 0 },
];
