/**
 * Shared test utilities reused across all test files.
 */

// ============================================
// Mock User Factories
// ============================================
function createMockUser(overrides = {}) {
  return {
    id: 'user-1',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@test.com',
    phone: '',
    bio: '',
    status: 'verified',
    subscriptionTier: 'free',
    isVerified: false,
    city: 'Boston',
    state: 'MA',
    latitude: 42.36,
    longitude: -71.06,
    profilePhotoUrl: null,
    onboardingCompleted: true,
    onboardingStep: 5,
    rating: 4.5,
    ratingCount: 10,
    totalTransactions: 5,
    isFounder: false,
    referralCode: 'BH-TEST',
    hasConnectAccount: false,
    ...overrides,
  };
}

function createPlusUser(overrides = {}) {
  return createMockUser({ subscriptionTier: 'plus', ...overrides });
}

function createVerifiedUser(overrides = {}) {
  return createMockUser({
    isVerified: true,
    subscriptionTier: 'plus',
    ...overrides,
  });
}

function createFreeUser(overrides = {}) {
  return createMockUser({ subscriptionTier: 'free', isVerified: false, ...overrides });
}

// ============================================
// Navigation Factory
// ============================================
function createMockNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    getParent: () => ({ setOptions: jest.fn() }),
    reset: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    canGoBack: () => true,
  };
}

// ============================================
// Auth Context Mock Setup
// ============================================
function setupAuthMock(userOverrides = {}) {
  const user = createMockUser(userOverrides);
  const mockLogin = jest.fn().mockResolvedValue(user);
  const mockRegister = jest.fn().mockResolvedValue({
    user,
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
  });
  const mockLogout = jest.fn();
  const mockRefreshUser = jest.fn();
  const mockLoginWithGoogle = jest.fn();
  const mockLoginWithApple = jest.fn();

  return {
    user,
    isLoading: false,
    isAuthenticated: true,
    login: mockLogin,
    register: mockRegister,
    logout: mockLogout,
    refreshUser: mockRefreshUser,
    loginWithGoogle: mockLoginWithGoogle,
    loginWithApple: mockLoginWithApple,
  };
}

// ============================================
// Error Context Mock Setup
// ============================================
function setupErrorMock() {
  return {
    showError: jest.fn(),
    showToast: jest.fn(),
    dismiss: jest.fn(),
    dismissError: jest.fn(),
  };
}

// ============================================
// Data Factory Functions
// ============================================
function createMockListing(overrides = {}) {
  return {
    id: 'listing-1',
    title: 'Power Drill',
    description: 'DeWalt 20V cordless drill',
    condition: 'good',
    isFree: true,
    pricePerDay: 0,
    depositAmount: 0,
    visibility: 'close_friends',
    isAvailable: true,
    isOwner: false,
    owner: {
      id: 'user-2',
      firstName: 'Alice',
      lastName: 'Jones',
      profilePhotoUrl: null,
      isVerified: true,
      rating: 4.8,
      ratingCount: 5,
      totalTransactions: 10,
    },
    photos: [],
    photoUrl: 'https://test.com/photo.jpg',
    timesBorrowed: 3,
    minDuration: 1,
    maxDuration: 14,
    category: { id: 'cat-1', name: 'Tools', slug: 'tools-hardware' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockTransaction(overrides = {}) {
  return {
    id: 'txn-1',
    status: 'pending',
    listing: createMockListing(),
    borrower: {
      id: 'user-1',
      firstName: 'Test',
      lastName: 'User',
      profilePhotoUrl: null,
    },
    lender: {
      id: 'user-2',
      firstName: 'Alice',
      lastName: 'Jones',
      profilePhotoUrl: null,
    },
    message: 'Need it for a project',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    totalAmount: 0,
    depositAmount: 0,
    rentalFee: 0,
    isFree: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockConversation(overrides = {}) {
  return {
    id: 'conv-1',
    otherUser: {
      id: 'user-2',
      firstName: 'Alice',
      lastName: 'Jones',
      profilePhotoUrl: null,
    },
    lastMessage: {
      content: 'Hey, is this available?',
      createdAt: new Date().toISOString(),
      senderId: 'user-2',
    },
    unreadCount: 0,
    listing: null,
    ...overrides,
  };
}

function createMockNotification(overrides = {}) {
  return {
    id: 'notif-1',
    type: 'borrow_request',
    title: 'New borrow request',
    body: 'Alice wants to borrow your drill',
    isRead: false,
    createdAt: new Date().toISOString(),
    transactionId: 'txn-1',
    ...overrides,
  };
}

function createMockCommunity(overrides = {}) {
  return {
    id: 'comm-1',
    name: 'Test Hood',
    description: 'A test neighborhood',
    memberCount: 25,
    listingCount: 10,
    latitude: 42.36,
    longitude: -71.06,
    radius: 5,
    ...overrides,
  };
}

function createMockDispute(overrides = {}) {
  return {
    id: 'dispute-1',
    status: 'open',
    reason: 'Item returned damaged',
    description: 'The item came back with scratches',
    transaction: createMockTransaction(),
    reporter: {
      id: 'user-1',
      firstName: 'Test',
      lastName: 'User',
    },
    respondent: {
      id: 'user-2',
      firstName: 'Alice',
      lastName: 'Jones',
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

module.exports = {
  createMockUser,
  createPlusUser,
  createVerifiedUser,
  createFreeUser,
  createMockNavigation,
  setupAuthMock,
  setupErrorMock,
  createMockListing,
  createMockTransaction,
  createMockConversation,
  createMockNotification,
  createMockCommunity,
  createMockDispute,
};
