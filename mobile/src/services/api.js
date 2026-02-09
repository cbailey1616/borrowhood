import { API_URL } from '../utils/config';

// Token management
let authToken = null;

const setAuthToken = (token) => {
  authToken = token;
};

// Fetch helper
const request = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;

  console.log('API Request:', url); // Debug logging

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || 'An error occurred');
      error.code = data.code; // Preserve error code from server
      error.requiredTier = data.requiredTier; // Preserve tier info if present
      throw error;
    }

    return data;
  } catch (error) {
    console.log('API Error:', error.message, error.code); // Debug logging
    // Re-throw with preserved properties
    const apiError = new Error(error.message || 'Network error');
    apiError.code = error.code;
    apiError.requiredTier = error.requiredTier;
    throw apiError;
  }
};

const get = (endpoint, params = {}) => {
  const queryString = Object.keys(params).length
    ? '?' + new URLSearchParams(params).toString()
    : '';
  return request(`${endpoint}${queryString}`, { method: 'GET' });
};

const post = (endpoint, body = {}) =>
  request(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const patch = (endpoint, body = {}) =>
  request(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

const put = (endpoint, body = {}) =>
  request(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

const del = (endpoint) =>
  request(endpoint, { method: 'DELETE' });

// ============================================
// Auth
// ============================================
const login = (email, password) =>
  post('/auth/login', { email, password });

const register = (data) =>
  post('/auth/register', data);

const getMe = () =>
  get('/auth/me');

const startIdentityVerification = () =>
  post('/auth/verify-identity');

const checkVerification = () =>
  post('/auth/check-verification');

const resetVerification = () =>
  post('/auth/reset-verification');

const forgotPassword = (email) =>
  post('/auth/forgot-password', { email });

const resetPassword = (email, code, newPassword) =>
  post('/auth/reset-password', { email, code, newPassword });

const loginWithGoogle = (idToken) =>
  post('/auth/google', { idToken });

const loginWithApple = (identityToken, fullName) =>
  post('/auth/apple', { identityToken, fullName });

// ============================================
// Users
// ============================================
const getUser = (id) =>
  get(`/users/${id}`);

const updateProfile = (data) =>
  patch('/users/me', data);

const getFriends = () =>
  get('/users/me/friends');

const addFriend = (friendId) =>
  post('/users/me/friends', { friendId });

const removeFriend = (friendId) =>
  del(`/users/me/friends/${friendId}`);

const getUserRatings = (userId) =>
  get(`/users/${userId}/ratings`);

const getUserListings = (userId) =>
  get(`/users/${userId}/listings`);

const getFriendRequests = () =>
  get('/users/me/friend-requests');

const acceptFriendRequest = (requestId) =>
  post(`/users/me/friend-requests/${requestId}/accept`);

const declineFriendRequest = (requestId) =>
  post(`/users/me/friend-requests/${requestId}/decline`);

const searchUsers = (query) =>
  get('/users/search', { q: query });

const matchContacts = (phoneNumbers) =>
  post('/users/contacts/match', { phoneNumbers });

// ============================================
// Communities
// ============================================
const getCommunities = (params) =>
  get('/communities', params);

const getCommunity = (id) =>
  get(`/communities/${id}`);

const joinCommunity = (id) =>
  post(`/communities/${id}/join`);

const leaveCommunity = (id) =>
  post(`/communities/${id}/leave`);

const getCommunityMembers = (id, params) =>
  get(`/communities/${id}/members`, params);

const createCommunity = (data) =>
  post('/communities', data);

// ============================================
// Listings
// ============================================
const getListings = (params) =>
  get('/listings', params);

const getMyListings = () =>
  get('/listings/mine');

const getListing = (id) =>
  get(`/listings/${id}`);

const createListing = (data) =>
  post('/listings', data);

const updateListing = (id, data) =>
  patch(`/listings/${id}`, data);

const deleteListing = (id) =>
  del(`/listings/${id}`);

const analyzeListingImage = (imageUrl) =>
  post('/listings/analyze-image', { imageUrl });

// ============================================
// Categories
// ============================================
const getCategories = () =>
  get('/categories');

// ============================================
// Feed
// ============================================
const getFeed = (params) =>
  get('/feed', params);

// ============================================
// Transactions
// ============================================
const getTransactions = (params) =>
  get('/transactions', params);

const getTransaction = (id) =>
  get(`/transactions/${id}`);

const createTransaction = (data) =>
  post('/transactions', data);

const approveTransaction = (id, response) =>
  post(`/transactions/${id}/approve`, { response });

const declineTransaction = (id, reason) =>
  post(`/transactions/${id}/decline`, { reason });

const confirmPayment = (id) =>
  post(`/transactions/${id}/confirm-payment`);

const confirmPickup = (id, condition) =>
  post(`/transactions/${id}/pickup`, { condition });

const confirmReturn = (id, condition, notes) =>
  post(`/transactions/${id}/return`, { condition, notes });

const rateTransaction = (id, rating, comment) =>
  post(`/transactions/${id}/rate`, { rating, comment });

// ============================================
// Disputes
// ============================================
const getDisputes = (params) =>
  get('/disputes', params);

const getDispute = (id) =>
  get(`/disputes/${id}`);

const resolveDispute = (id, outcome, lenderPercent, notes) =>
  post(`/disputes/${id}/resolve`, { outcome, lenderPercent, notes });

const addDisputeEvidence = (id, urls) =>
  post(`/disputes/${id}/evidence`, { urls });

// ============================================
// Notifications
// ============================================
const getNotifications = (params) =>
  get('/notifications', params);

const markNotificationRead = (id) =>
  post(`/notifications/${id}/read`);

const markAllNotificationsRead = () =>
  post('/notifications/read-all');

const updatePushToken = (token) =>
  put('/notifications/push-token', { token });

const updateNotificationPreferences = (preferences) =>
  patch('/notifications/preferences', preferences);

const getBadgeCount = () =>
  get('/notifications/badge-count');

// ============================================
// Item Requests (Wanted Posts)
// ============================================
const getRequests = (params) =>
  get('/requests', params);

const getMyRequests = () =>
  get('/requests/mine');

const getRequest = (id) =>
  get(`/requests/${id}`);

const createRequest = (data) =>
  post('/requests', data);

const updateRequest = (id, data) =>
  patch(`/requests/${id}`, data);

const deleteRequest = (id) =>
  del(`/requests/${id}`);

const renewRequest = (id, expiresIn) =>
  post(`/requests/${id}/renew`, expiresIn ? { expiresIn } : {});

// ============================================
// Messages / Chat
// ============================================
const getConversations = () =>
  get('/messages/conversations');

const getConversation = (id, params) =>
  get(`/messages/conversations/${id}`, params);

const sendMessage = (data) =>
  post('/messages', data);

const markConversationRead = (id) =>
  post(`/messages/conversations/${id}/read`);

// ============================================
// Payment Methods
// ============================================
const getPaymentMethods = () =>
  get('/payment-methods');

const addPaymentMethod = (data) =>
  post('/payment-methods', data);

const removePaymentMethod = (id) =>
  del(`/payment-methods/${id}`);

const setDefaultPaymentMethod = (id) =>
  post(`/payment-methods/${id}/default`);

// ============================================
// Notification Preferences
// ============================================
const getNotificationPreferences = () =>
  get('/notifications/preferences');

// ============================================
// File Uploads (S3)
// ============================================
const getPresignedUrl = (contentType, fileSize, category) =>
  post('/uploads/presigned-url', { contentType, fileSize, category });

const getPresignedUrls = (files, category) =>
  post('/uploads/presigned-urls', { files, category });

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Upload timed out. Please check your connection and try again.')), ms)
    ),
  ]);

const uploadToS3 = async (uploadUrl, fileUri, contentType, isLocal = false) => {
  // Read file as blob for upload
  const response = await withTimeout(fetch(fileUri), 30000);
  const blob = await response.blob();

  const headers = {
    'Content-Type': contentType,
  };

  // Add auth token for local uploads
  if (isLocal && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const uploadResponse = await withTimeout(fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: blob,
  }), 60000);

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => 'Unknown error');
    console.log('Upload failed:', uploadResponse.status, errorText);
    throw new Error('Failed to upload file');
  }

  return true;
};

const uploadImage = async (fileUri, category = 'listings') => {
  // Get file info
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const contentType = blob.type || 'image/jpeg';
  const fileSize = blob.size;

  // Get presigned URL
  const { uploadUrl, publicUrl, isLocal } = await getPresignedUrl(contentType, fileSize, category);

  // Upload file
  await uploadToS3(uploadUrl, fileUri, contentType, isLocal);

  return publicUrl;
};

const uploadImages = async (fileUris, category = 'listings') => {
  // Get file info for all images
  const fileInfos = await Promise.all(
    fileUris.map(async (uri) => {
      const response = await fetch(uri);
      const blob = await response.blob();
      return {
        uri,
        contentType: blob.type || 'image/jpeg',
        fileSize: blob.size,
      };
    })
  );

  // Get presigned URLs for all files
  const { urls } = await getPresignedUrls(
    fileInfos.map(f => ({ contentType: f.contentType, fileSize: f.fileSize })),
    category
  );

  // Upload all files in parallel
  await Promise.all(
    urls.map((urlInfo, index) =>
      uploadToS3(urlInfo.uploadUrl, fileInfos[index].uri, fileInfos[index].contentType, urlInfo.isLocal)
    )
  );

  // Return public URLs
  return urls.map(u => u.publicUrl);
};

// ============================================
// Discussions
// ============================================
const getDiscussions = (listingId, params) =>
  get(`/listings/${listingId}/discussions`, params);

const getDiscussionReplies = (listingId, postId, params) =>
  get(`/listings/${listingId}/discussions/${postId}/replies`, params);

const createDiscussionPost = (listingId, data) =>
  post(`/listings/${listingId}/discussions`, data);

const deleteDiscussionPost = (listingId, postId) =>
  del(`/listings/${listingId}/discussions/${postId}`);

// ============================================
// Sustainability
// ============================================
const getSustainabilityStats = () =>
  get('/sustainability/stats');

const getCommunitySustainability = () =>
  get('/sustainability/community');

// ============================================
// Badges
// ============================================
const getAllBadges = () =>
  get('/badges');

const getMyBadges = () =>
  get('/badges/mine');

const getUserBadges = (userId) =>
  get(`/badges/user/${userId}`);

const getLeaderboard = () =>
  get('/badges/leaderboard');

const checkBadges = () =>
  post('/badges/check');

// ============================================
// Bundles
// ============================================
const getBundles = () =>
  get('/bundles');

const getMyBundles = () =>
  get('/bundles/mine');

const createBundle = (data) =>
  post('/bundles', data);

const deleteBundle = (id) =>
  del(`/bundles/${id}`);

// ============================================
// Lending Circles
// ============================================
const getCircles = () =>
  get('/circles');

const getCircle = (id) =>
  get(`/circles/${id}`);

const createCircle = (data) =>
  post('/circles', data);

const inviteToCircle = (circleId, userId) =>
  post(`/circles/${circleId}/invite`, { userId });

const joinCircle = (circleId) =>
  post(`/circles/${circleId}/join`);

const leaveCircle = (circleId) =>
  post(`/circles/${circleId}/leave`);

// ============================================
// Seasonal Suggestions
// ============================================
const getSeasonalSuggestions = () =>
  get('/seasonal/suggestions');

const getFeaturedSeasonal = () =>
  get('/seasonal/featured');

// ============================================
// Availability Calendar
// ============================================
const getListingAvailability = (listingId, params) =>
  get(`/listings/${listingId}/availability`, params);

const setListingAvailability = (listingId, data) =>
  post(`/listings/${listingId}/availability`, data);

const checkAvailability = (listingId, startDate, endDate) =>
  get(`/listings/${listingId}/check-availability`, { startDate, endDate });

// ============================================
// Community Library
// ============================================
const getLibraryItems = () =>
  get('/library');

const donateToLibrary = (listingId, conditionNotes) =>
  post('/library/donate', { listingId, conditionNotes });

const checkoutLibraryItem = (itemId, returnDate) =>
  post(`/library/${itemId}/checkout`, { returnDate });

const returnLibraryItem = (itemId) =>
  post(`/library/${itemId}/return`);

// ============================================
// Stripe Connect
// ============================================
const getConnectStatus = () =>
  get('/users/me/connect-status');

const createConnectAccount = () =>
  post('/users/me/connect-account');

const getConnectOnboardingLink = (returnUrl) =>
  post('/users/me/connect-onboarding', { returnUrl });

// ============================================
// Subscriptions
// ============================================
const getSubscriptionTiers = () =>
  get('/subscriptions/tiers');

const getCurrentSubscription = () =>
  get('/subscriptions/current');

const createSubscription = (plan = 'monthly') =>
  post('/subscriptions/subscribe', { plan });

const cancelSubscription = () =>
  post('/subscriptions/cancel');

const reactivateSubscription = () =>
  post('/subscriptions/reactivate');

const retrySubscriptionPayment = () =>
  post('/subscriptions/retry-payment');

const checkSubscriptionAccess = (visibility) =>
  get('/subscriptions/access-check', { feature: visibility });

// Payments
const createPaymentIntent = (amount, description, metadata) =>
  post('/payments/create-payment-intent', { amount, description, metadata });

const refundPayment = (paymentIntentId, amount) =>
  post('/payments/refund', { paymentIntentId, ...(amount ? { amount } : {}) });

// Identity Verification
const createVerificationSession = () =>
  post('/identity/verify');

const getVerificationStatus = () =>
  get('/identity/status');

// Rentals
const createRentalRequest = (data) =>
  post('/rentals/request', data);

const approveRental = (id, response) =>
  post(`/rentals/${id}/approve`, { response });

const declineRental = (id, reason) =>
  post(`/rentals/${id}/decline`, { reason });

const confirmRentalPayment = (id) =>
  post(`/rentals/${id}/confirm-payment`);

const confirmRentalPickup = (id, condition) =>
  post(`/rentals/${id}/pickup`, { condition });

const confirmRentalReturn = (id, condition, notes) =>
  post(`/rentals/${id}/return`, { condition, notes });

const submitDamageClaim = (id, { amountCents, notes, evidenceUrls }) =>
  post(`/rentals/${id}/damage-claim`, { amountCents, notes, evidenceUrls });

const createLateFee = (id) =>
  post(`/rentals/${id}/late-fee`);

const getRentalPaymentStatus = (id) =>
  get(`/rentals/${id}/payment-status`);

const getConnectBalance = () =>
  get('/users/me/connect-balance');

// Onboarding
const updateOnboardingStep = (step) =>
  patch('/onboarding/step', { step });

const completeOnboarding = () =>
  post('/onboarding/complete');

const getNearbyNeighborhoods = (lat, lng, radius = 5) =>
  get('/communities/nearby', { lat, lng, radius });

const getSuggestedUsers = (neighborhoodId) =>
  get('/users/suggested', neighborhoodId ? { neighborhood: neighborhoodId } : {});

// Saved listings
const getSavedListings = () => get('/saved');
const saveListing = (listingId) => post(`/saved/${listingId}`);
const unsaveListing = (listingId) => del(`/saved/${listingId}`);
const checkSaved = (listingId) => get(`/saved/check/${listingId}`);

// ============================================
// Referrals
// ============================================
const getReferralCode = () => get('/referrals/code');
const getReferralStatus = () => get('/referrals/status');
const claimReferralReward = () => post('/referrals/claim');

export default {
  setAuthToken,
  // Auth
  login,
  register,
  getMe,
  startIdentityVerification,
  checkVerification,
  resetVerification,
  forgotPassword,
  resetPassword,
  loginWithGoogle,
  loginWithApple,
  // Users
  getUser,
  updateProfile,
  getFriends,
  addFriend,
  removeFriend,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  getUserRatings,
  getUserListings,
  searchUsers,
  matchContacts,
  // Communities
  getCommunities,
  getCommunity,
  joinCommunity,
  leaveCommunity,
  getCommunityMembers,
  createCommunity,
  // Listings
  getListings,
  getMyListings,
  getListing,
  createListing,
  updateListing,
  deleteListing,
  analyzeListingImage,
  // Categories
  getCategories,
  // Feed
  getFeed,
  // Transactions
  getTransactions,
  getTransaction,
  createTransaction,
  approveTransaction,
  declineTransaction,
  confirmPayment,
  confirmPickup,
  confirmReturn,
  rateTransaction,
  // Disputes
  getDisputes,
  getDispute,
  resolveDispute,
  addDisputeEvidence,
  // Notifications
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updatePushToken,
  updateNotificationPreferences,
  getBadgeCount,
  // Requests (Wanted Posts)
  getRequests,
  getMyRequests,
  getRequest,
  createRequest,
  updateRequest,
  deleteRequest,
  renewRequest,
  // Messages / Chat
  getConversations,
  getConversation,
  sendMessage,
  markConversationRead,
  // Payment Methods
  getPaymentMethods,
  addPaymentMethod,
  removePaymentMethod,
  setDefaultPaymentMethod,
  // Notification Preferences
  getNotificationPreferences,
  // File Uploads (S3)
  getPresignedUrl,
  getPresignedUrls,
  uploadToS3,
  uploadImage,
  uploadImages,
  // Stripe Connect
  getConnectStatus,
  createConnectAccount,
  getConnectOnboardingLink,
  // Discussions
  getDiscussions,
  getDiscussionReplies,
  createDiscussionPost,
  deleteDiscussionPost,
  // Sustainability
  getSustainabilityStats,
  getCommunitySustainability,
  // Badges
  getAllBadges,
  getMyBadges,
  getUserBadges,
  getLeaderboard,
  checkBadges,
  // Bundles
  getBundles,
  getMyBundles,
  createBundle,
  deleteBundle,
  // Lending Circles
  getCircles,
  getCircle,
  createCircle,
  inviteToCircle,
  joinCircle,
  leaveCircle,
  // Seasonal
  getSeasonalSuggestions,
  getFeaturedSeasonal,
  // Availability
  getListingAvailability,
  setListingAvailability,
  checkAvailability,
  // Community Library
  getLibraryItems,
  donateToLibrary,
  checkoutLibraryItem,
  returnLibraryItem,
  // Subscriptions
  getSubscriptionTiers,
  getCurrentSubscription,
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
  retrySubscriptionPayment,
  checkSubscriptionAccess,
  // Payments
  createPaymentIntent,
  refundPayment,
  // Identity Verification
  createVerificationSession,
  getVerificationStatus,
  // Rentals
  createRentalRequest,
  approveRental,
  declineRental,
  confirmRentalPayment,
  confirmRentalPickup,
  confirmRentalReturn,
  submitDamageClaim,
  createLateFee,
  getRentalPaymentStatus,
  getConnectBalance,
  // Saved listings
  getSavedListings,
  saveListing,
  unsaveListing,
  checkSaved,
  // Referrals
  getReferralCode,
  getReferralStatus,
  claimReferralReward,
  // Onboarding
  updateOnboardingStep,
  completeOnboarding,
  getNearbyNeighborhoods,
  getSuggestedUsers,
};
