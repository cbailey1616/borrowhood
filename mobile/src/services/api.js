import { API_URL } from '../utils/config';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Compress image to max 1600px wide, JPEG 80% quality
const compressImage = async (uri) => {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.8, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri; // fallback to original if compression fails
  }
};

// Token management
let authToken = null;
let sessionVersion = 0;
let sessionExpiredHandler = null;

const captureSession = () => {
  const version = sessionVersion;
  return () => {
    if (version !== sessionVersion) throw Object.assign(new Error('Your account changed. Please try again.'), { code: 'SESSION_CHANGED' });
  };
};

// Abort timed-out work and always clear its timer, including successful uploads.
const fetchWithTimeout = async (url, options = {}, milliseconds = 30000, consume = response => response) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort);
  let timer;
  try {
    return await Promise.race([
      fetch(url, { ...options, signal: controller.signal }).then(consume),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('The request timed out. Please check your connection and try again.'), { code: 'REQUEST_TIMEOUT' }));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
};

const setSessionExpiredHandler = handler => {
  sessionExpiredHandler = handler;
  return () => { if (sessionExpiredHandler === handler) sessionExpiredHandler = null; };
};

const setAuthToken = (token) => {
  sessionVersion += 1;
  authToken = token;
};

// Fetch helper
const request = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;
  const requestToken = authToken;
  const assertSession = captureSession();

  if (__DEV__) console.log('API Request:', url);

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken && !headers.Authorization) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const { response, data } = await fetchWithTimeout(url, config, 30000, async response => {
      let data;
      try { data = await response.json(); }
      catch {
        if (response.ok && response.status !== 204) throw new Error('Could not read the server response. Please try again.');
        data = {};
      }
      return { response, data };
    });
    assertSession();

    if (!response.ok) {
      // An old request must never sign out a newly signed-in account. Incorrect
      // login/password/code responses have no session code and do not trigger this.
      if (requestToken && requestToken === authToken && headers.Authorization === `Bearer ${requestToken}` &&
          ((response.status === 401 && ['SESSION_EXPIRED', 'INVALID_SESSION'].includes(data.code)) ||
           (response.status === 403 && data.code === 'ACCOUNT_SUSPENDED'))) {
        setAuthToken(null);
        await sessionExpiredHandler?.();
      }
      // Handle express-validator errors array and single error string
      let message = data.error;
      if (!message && data.errors && Array.isArray(data.errors)) {
        message = data.errors.map(e => e.msg || e.message).filter(Boolean)[0];
      }
      const error = new Error(message || 'Something went wrong. Please try again.');
      error.status = response.status;
      error.code = data.code;
      error.retryAfter = data.retryAfter;
      if (data.code === 'ACCOUNT_LINK_REQUIRED') error.email = data.email;
      error.requiredTier = data.requiredTier;
      throw error;
    }

    return data;
  } catch (error) {
    if (__DEV__) console.log('API Error:', error.message, error.code);
    // Re-throw with preserved properties
    const apiError = new Error(error.message || 'Network error');
    apiError.status = error.status;
    apiError.code = error.code;
    apiError.retryAfter = error.retryAfter;
    apiError.email = error.email;
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
  post('/auth/register', { ...data, verificationFlow: 'email-code-v1' });

const verifySignupCode = (challengeId, code) => post('/auth/register/verify', { challengeId, code });
const resendSignupCode = (challengeId) => post('/auth/register/resend', { challengeId });

const getMe = () =>
  get('/auth/me');

const startIdentityVerification = () =>
  post('/auth/verify-identity');

const checkVerification = () =>
  get('/identity/status');

const resetVerification = () =>
  post('/auth/reset-verification');

const forgotPassword = (email) =>
  post('/auth/forgot-password', { email });

const verifyResetCode = (email, code) =>
  post('/auth/verify-reset-code', { email, code });

const resetPassword = (resetToken, newPassword) =>
  post('/auth/reset-password', { resetToken, newPassword });

const changePassword = (currentPassword, newPassword) =>
  post('/auth/change-password', { currentPassword, newPassword });

const findAccount = (params) =>
  post('/auth/find-account', params);

const linkAccount = (provider, token, accessToken) =>
  request('/auth/link-account', { method: 'POST', body: JSON.stringify({ provider, ...token }),
    ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}) });

const loginWithGoogle = (idToken) =>
  post('/auth/google', { idToken });

const startSocialLinkCode = (provider, token) =>
  post('/auth/social-link/code', { provider, ...token });

const completeSocialLinkCode = (provider, token, challengeId, code) =>
  post('/auth/social-link/complete', { provider, ...token, challengeId, code });

const loginWithApple = (identityToken, fullName) =>
  post('/auth/apple', { identityToken, fullName });

const deleteAccount = () =>
  del('/auth/account');

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

const updateCommunity = (id, data) =>
  patch(`/communities/${id}`, data);

const getCommunityMembers = (id, params) =>
  get(`/communities/${id}/members`, params);

const addCommunityAdmin = (communityId, userId) =>
  post(`/communities/${communityId}/add-admin`, { userId });

const removeCommunityMember = (communityId, userId) =>
  del(`/communities/${communityId}/members/${userId}`);

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

const createListing = ({ requestMatchId, ...data }) =>
  post('/listings', { ...data, ...(requestMatchId && { requestMatchId }) });

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


const cancelTransaction = (id) =>
  post(`/transactions/${id}/cancel`);

const getRequestQueue = id => get(`/listings/${id}/requests`);
const endorseTransaction = (id, positive) => post(`/transactions/${id}/endorse`, { positive });
const rateTransaction = (id, rating, comment) =>
  post(`/transactions/${id}/rate`, { rating, comment });

// ============================================
// Disputes
// ============================================
const getDisputes = (params) =>
  get('/disputes', params);

const getDispute = (id) =>
  get(`/disputes/${id}`);

const fileDispute = (data) =>
  post('/disputes', data);

const respondToDispute = (id, data) =>
  post(`/disputes/${id}/respond`, data);

const resolveDispute = (id, { outcome, resolvedAmount, notes }) =>
  post(`/disputes/${id}/resolve`, { outcome, resolvedAmount, notes });

const acceptDispute = (id) =>
  post(`/disputes/${id}/accept`);

const acceptCounter = (id) =>
  post(`/disputes/${id}/accept-counter`);

const declineCounter = (id) =>
  post(`/disputes/${id}/decline-counter`);

const addDisputeEvidence = (id, urls) =>
  post(`/disputes/${id}/evidence`, { urls });

// ============================================
// Notifications
// ============================================
const getNotifications = (params) =>
  get('/notifications', params);

const markNotificationRead = (id, notificationIds) =>
  post(`/notifications/${id}/read`, notificationIds ? { notificationIds } : undefined);

const markAllNotificationsRead = () =>
  post('/notifications/read-all');

const deviceRequest = async (endpoint, method, data) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try { return await request(endpoint, { method, body: JSON.stringify(data), signal: controller.signal }); }
  finally { clearTimeout(timeout); }
};
const updatePushToken = (token, device = {}) =>
  deviceRequest('/notifications/push-token', 'PUT', { token, ...device });
const revokePushDevice = device => deviceRequest('/notifications/revoke-device', 'POST', device);

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

const offerItem = (requestId, listingId) => post(`/requests/${requestId}/offers`, { listingId });
const getRequestOffers = (id) => get(`/requests/${id}/offers`);
const withdrawOffer = (requestId, listingId) => del(`/requests/${requestId}/offers/${listingId}`);

const getRequest = (id) =>
  get(`/requests/${id}`);

const createRequest = (data) =>
  post('/requests', data);

const updateRequest = (id, data) =>
  patch(`/requests/${id}`, data);

const deleteRequest = (id) =>
  del(`/requests/${id}`);

const renewRequest = (id, expiresIn) =>
  post(`/requests/${id}/renew`, { ...(expiresIn ? { expiresIn } : {}), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });

// ============================================
// Messages / Chat
// ============================================
const getConversations = () =>
  get('/messages/conversations');

const getConversation = (id, params) =>
  get(`/messages/conversations/${id}`, params);

const getMessageCapabilities = () => get('/messages/capabilities');
const sendMessage = (data) =>
  post('/messages', data);

const markConversationRead = async (id) => {
  if (id.startsWith('community:')) {
    const communityId = id.slice(10);
    const snapshot = await get(`/communities/${communityId}/chat`);
    return post(`/communities/${communityId}/chat/read`, { sequence: snapshot.readSequence });
  }
  return post(`/messages/conversations/${id}/read`);
};

const deleteMessage = (id) =>
  del(`/messages/${id}`);

const reactToMessage = (id, emoji) =>
  post(`/messages/${id}/react`, { emoji });

const removeReaction = (id) =>
  del(`/messages/${id}/react`);

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

const uploadToS3 = async (uploadUrl, fileUri, contentType, isLocal = false) => {
  const assertSession = captureSession();
  const uploadToken = authToken;
  // Read file as blob for upload
  const blob = await fetchWithTimeout(fileUri, {}, 30000, response => response.blob());
  assertSession();

  const headers = {
    'Content-Type': contentType,
  };

  // Add auth token for local uploads
  if (isLocal && uploadToken) {
    headers['Authorization'] = `Bearer ${uploadToken}`;
  }

  const uploadResponse = await fetchWithTimeout(uploadUrl, {
    method: 'PUT',
    headers,
    body: blob,
  }, 60000, async response => ({ ok: response.ok, errorText: response.ok ? null : await response.text().catch(() => 'Unknown error') }));
  assertSession();

  if (!uploadResponse.ok) {
    const errorText = uploadResponse.errorText;
    console.log('Upload failed:', uploadResponse.status, errorText);
    throw new Error('Failed to upload file');
  }

  return true;
};

const uploadImage = async (fileUri, category = 'listings') => {
  const assertSession = captureSession();
  // Compress before upload
  const compressedUri = await compressImage(fileUri);
  assertSession();
  // Get file info
  const blob = await fetchWithTimeout(compressedUri, {}, 30000, response => response.blob());
  assertSession();
  const contentType = blob.type || 'image/jpeg';
  const fileSize = blob.size;

  // Get presigned URL
  const { uploadUrl, publicUrl, isLocal } = await getPresignedUrl(contentType, fileSize, category);
  assertSession();

  // Upload file
  await uploadToS3(uploadUrl, compressedUri, contentType, isLocal);
  assertSession();

  return publicUrl;
};

const uploadImages = async (fileUris, category = 'listings') => {
  const assertSession = captureSession();
  // Compress images before upload (resize to 1200px wide, JPEG 70%)
  const compressedUris = await Promise.all(fileUris.map(compressImage));
  assertSession();

  // Get file info for all images
  const fileInfos = await Promise.all(
    compressedUris.map(async (uri) => {
      const blob = await fetchWithTimeout(uri, {}, 30000, response => response.blob());
      return {
        uri,
        contentType: blob.type || 'image/jpeg',
        fileSize: blob.size,
      };
    })
  );
  assertSession();

  // Get presigned URLs for all files
  const { urls } = await getPresignedUrls(
    fileInfos.map(f => ({ contentType: f.contentType, fileSize: f.fileSize })),
    category
  );
  assertSession();

  // Upload all files in parallel
  await Promise.all(
    urls.map((urlInfo, index) =>
      uploadToS3(urlInfo.uploadUrl, fileInfos[index].uri, fileInfos[index].contentType, urlInfo.isLocal)
    )
  );
  assertSession();

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

// Request Discussions (Wanted Posts)
const getRequestDiscussions = (requestId, params) =>
  get(`/requests/${requestId}/discussions`, params);

const getRequestDiscussionReplies = (requestId, postId, params) =>
  get(`/requests/${requestId}/discussions/${postId}/replies`, params);

const createRequestDiscussionPost = (requestId, data) =>
  post(`/requests/${requestId}/discussions`, data);

const deleteRequestDiscussionPost = (requestId, postId) =>
  del(`/requests/${requestId}/discussions/${postId}`);

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

const createVerificationPayment = () =>
  post('/subscriptions/verify-payment');

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
// NOTE: rental/borrow requests are created via createTransaction (POST /transactions),
// which creates the manual-capture PaymentIntent. The old /rentals/request endpoint
// was removed (it never created a PI and was unused).

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

const cancelRental = (id) =>
  post(`/rentals/${id}/cancel`);

const extendPickup = (id, reviewAt) =>
  post(`/transactions/${id}/pickup-extension`, { reviewAt });

const submitDamageClaim = (id, { amountCents, notes, evidenceUrls }) =>
  post(`/rentals/${id}/damage-claim`, { amountCents, notes, evidenceUrls });

const createLateFee = (id) =>
  post(`/rentals/${id}/late-fee`);

const getRentalPaymentStatus = (id) =>
  get(`/rentals/${id}/payment-status`);

const getConnectBalance = () =>
  get('/users/me/connect-balance');

const testVerifyConnect = () =>
  post('/users/me/connect-test-verify');

const retryTransfers = () =>
  post('/users/me/retry-transfers');

const getEarnings = () =>
  get('/earnings');

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
  getCommunityChatSummary: id => get(`/communities/${id}/chat/summary`),
  getCommunityChat: (id, params) => get(`/communities/${id}/chat`, params),
  sendCommunityMessage: (id, data) => post(`/communities/${id}/chat`, data),
  markCommunityChatRead: (id, sequence) => post(`/communities/${id}/chat/read`, { sequence }),
  setCommunityChatMuted: (id, muted) => patch(`/communities/${id}/chat/preferences`, { muted }),
  deleteCommunityMessage: (id, messageId) => del(`/communities/${id}/chat/${messageId}`),
  getReturnHelp: (admin = false, page = 1, transactionId) => get(`/return-help${admin ? '/admin' : ''}?page=${page}${transactionId ? '&transactionId='+encodeURIComponent(transactionId) : ''}`),
  reportNonReturn: (id, detail) => post(`/return-help/exchange/${id}/report`, { detail }),
  extendReturn: (id, date) => post(`/return-help/exchange/${id}/extend`, { date }),
  respondReturnReport: (id, text, version, appeal = false) => post(`/return-help/${id}/${appeal ? 'appeal' : 'respond'}`, { text, version }),
  reviewReturnReport: (id, decision) => post(`/return-help/${id}/review`, decision),
  getSafetyReports: (status = 'open', page = 1) => get(`/admin/safety-reports?status=${encodeURIComponent(status)}&page=${page}`),
  reviewSafetyReport: (id, decision) => post(`/admin/safety-reports/${id}/review`, decision),
  setSessionExpiredHandler,
  getFunnelInsights: (days = 30) => get(`/insights/funnel?days=${days}`),
  setAuthToken,
  // Auth
  login,
  register,
  verifySignupCode,
  resendSignupCode,
  getMe,
  startIdentityVerification,
  checkVerification,
  resetVerification,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  changePassword,
  findAccount,
  linkAccount,
  startSocialLinkCode,
  completeSocialLinkCode,
  loginWithGoogle,
  loginWithApple,
  deleteAccount,
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
  updateCommunity,
  getCommunityMembers,
  addCommunityAdmin,
  removeCommunityMember,
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
  getUserSafety: id => get(`/safety/${id}`),
  blockUser: id => post(`/safety/${id}/block`),
  unblockUser: id => del(`/safety/${id}/block`),
  reportUser: (id, reason) => post(`/safety/${id}/report`, { reason }),
  recordFeedEvents: events => post('/feed/events', { events }),
  // Transactions
  getTransactions,
  getTransaction,
  createTransaction,
  approveTransaction,
  declineTransaction,
  confirmPayment,
  confirmPickup,
  cancelTransaction,
  rateTransaction,
  getRequestQueue,
  endorseTransaction,
  // Disputes
  getDisputes,
  getDispute,
  fileDispute,
  respondToDispute,
  resolveDispute,
  acceptDispute,
  acceptCounter,
  declineCounter,
  addDisputeEvidence,
  // Notifications
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updatePushToken,
  revokePushDevice,
  updateNotificationPreferences,
  getBadgeCount,
  // Requests (Wanted Posts)
  getRequests,
  getMyRequests,
  getRequest,
  offerItem,
  getRequestOffers,
  withdrawOffer,
  createRequest,
  updateRequest,
  deleteRequest,
  renewRequest,
  // Messages / Chat
  getConversations,
  getConversation,
  sendMessage,
  getMessageCapabilities,
  markConversationRead,
  deleteMessage,
  reactToMessage,
  removeReaction,
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
  getDiscussionThread: (listingId, postId) => get(`/listings/${listingId}/discussions/${postId}`),
  createDiscussionPost,
  deleteDiscussionPost,
  // Request Discussions
  getRequestDiscussions,
  getRequestDiscussionReplies,
  getRequestDiscussionThread: (requestId, postId) => get(`/requests/${requestId}/discussions/${postId}`),
  createRequestDiscussionPost,
  deleteRequestDiscussionPost,
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
  createVerificationPayment,
  checkSubscriptionAccess,
  // Payments
  createPaymentIntent,
  refundPayment,
  // Identity Verification
  createVerificationSession,
  getVerificationStatus,
  // Rentals
  approveRental,
  declineRental,
  confirmRentalPayment,
  confirmRentalPickup,
  confirmRentalReturn,
  cancelRental,
  extendPickup,
  submitDamageClaim,
  createLateFee,
  getRentalPaymentStatus,
  getConnectBalance,
  getEarnings,
  testVerifyConnect,
  retryTransfers,
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
