import { API_URL } from '../utils/config';

// Token management
let authToken = null;

const setAuthToken = (token) => {
  authToken = token;
};

// Fetch helper
const request = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;

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
      throw new Error(data.error || 'An error occurred');
    }

    return data;
  } catch (error) {
    throw new Error(error.message || 'Network error');
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

const uploadToS3 = async (uploadUrl, fileUri, contentType) => {
  // Read file as blob for upload
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file to S3');
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
  const { uploadUrl, publicUrl } = await getPresignedUrl(contentType, fileSize, category);

  // Upload to S3
  await uploadToS3(uploadUrl, fileUri, contentType);

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
      uploadToS3(urlInfo.uploadUrl, fileInfos[index].uri, fileInfos[index].contentType)
    )
  );

  // Return public URLs
  return urls.map(u => u.publicUrl);
};

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
// Rent-to-Own
// ============================================
const getRTOContracts = (params) =>
  get('/rto/contracts', params);

const getRTOContract = (id) =>
  get(`/rto/contracts/${id}`);

const createRTOContract = (data) =>
  post('/rto/contracts', data);

const approveRTOContract = (id) =>
  post(`/rto/contracts/${id}/approve`);

const declineRTOContract = (id, reason) =>
  post(`/rto/contracts/${id}/decline`, { reason });

const cancelRTOContract = (id, reason) =>
  post(`/rto/contracts/${id}/cancel`, { reason });

const getRTOPayments = (contractId) =>
  get(`/rto/contracts/${contractId}/payments`);

const makeRTOPayment = (contractId) =>
  post(`/rto/contracts/${contractId}/pay`);

export default {
  setAuthToken,
  // Auth
  login,
  register,
  getMe,
  startIdentityVerification,
  // Users
  getUser,
  updateProfile,
  getFriends,
  addFriend,
  removeFriend,
  getUserRatings,
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
  // Requests (Wanted Posts)
  getRequests,
  getMyRequests,
  getRequest,
  createRequest,
  updateRequest,
  deleteRequest,
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
  // Rent-to-Own
  getRTOContracts,
  getRTOContract,
  createRTOContract,
  approveRTOContract,
  declineRTOContract,
  cancelRTOContract,
  getRTOPayments,
  makeRTOPayment,
};
