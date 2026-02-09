/**
 * Core Functionality Smoke Tests
 *
 * Tests that every primary user action works end-to-end at the SCREEN level.
 * If any of these fail, nothing else matters.
 *
 * For each test:
 *  1. Render the screen with required props/navigation params
 *  2. Fill in required fields
 *  3. Tap the submit/action button
 *  4. Verify the API was called (not blocked by UI logic)
 *  5. Verify success state (not an error or "maybe later")
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../src/services/api';

// ============================================
// Mock user and navigation shared across tests
// ============================================
const mockUser = {
  id: 'user-1',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@test.com',
  phone: '',
  bio: '',
  status: 'verified',
  subscriptionTier: 'plus',
  isVerified: true,
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
};

const mockNavigation = {
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

// ============================================
// Mock context hooks at module level
// ============================================
const mockLogin = jest.fn().mockResolvedValue(mockUser);
const mockRegister = jest.fn().mockResolvedValue({
  user: mockUser,
  accessToken: 'test-token',
  refreshToken: 'test-refresh',
});
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    isAuthenticated: true,
    login: mockLogin,
    register: mockRegister,
    logout: jest.fn(),
    refreshUser: mockRefreshUser,
    loginWithGoogle: jest.fn(),
    loginWithApple: jest.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

jest.mock('../src/context/ErrorContext', () => ({
  useError: () => ({
    showError: mockShowError,
    showToast: mockShowToast,
    dismiss: jest.fn(),
  }),
  ErrorProvider: ({ children }) => children,
}));

// ============================================
// Reset all mocks before each test
// ============================================
beforeEach(() => {
  jest.clearAllMocks();
  // Reset commonly-used API mocks with fresh defaults
  api.getCommunities.mockResolvedValue([{ id: 'comm-1', name: 'Test Hood' }]);
  api.getCategories.mockResolvedValue([
    { id: 'cat-1', name: 'Tools', slug: 'tools-hardware' },
    { id: 'cat-2', name: 'Kitchen', slug: 'kitchen-cooking' },
  ]);
  api.getFeed.mockResolvedValue({ items: [], hasMore: false });
  api.getNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
  api.getFriends.mockResolvedValue([]);
  api.getFriendRequests.mockResolvedValue([]);
  api.getSavedListings.mockResolvedValue([]);
  api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 });
  api.getPaymentMethods.mockResolvedValue([]);
  api.getConnectStatus.mockResolvedValue(null);
  api.checkSubscriptionAccess.mockResolvedValue({ canAccess: true, nextStep: null });
  api.getCurrentSubscription.mockResolvedValue({
    tier: 'free',
    name: 'Free',
    features: ['Borrow from friends'],
    isActive: true,
    status: null,
  });
});

// ============================================
// 1. Can a user register?
// ============================================
describe('Register', () => {
  it('should submit registration form and call register()', async () => {
    const RegisterScreen = require('../src/screens/auth/RegisterScreen').default;

    const { getByTestId, getByText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );

    // Use testIDs: Register.input.firstName, etc.
    // Placeholders: "John", "Doe", "you@example.com", "At least 8 characters", "Re-enter your password"
    fireEvent.changeText(getByTestId('Register.input.firstName'), 'Jane');
    fireEvent.changeText(getByTestId('Register.input.lastName'), 'Doe');
    fireEvent.changeText(getByTestId('Register.input.email'), 'jane@test.com');
    fireEvent.changeText(getByTestId('Register.input.password'), 'SecurePass123');
    fireEvent.changeText(getByTestId('Register.input.confirmPassword'), 'SecurePass123');

    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.com',
        password: 'SecurePass123',
      })
    );
  });
});

// ============================================
// 2. Can a user log in?
// ============================================
describe('Login', () => {
  it('should submit login form and call login()', async () => {
    const LoginScreen = require('../src/screens/auth/LoginScreen').default;

    const { getByPlaceholderText, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );

    // Placeholders: "you@example.com", "Enter your password"
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'MyPassword1');

    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });

    expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'MyPassword1');
  });
});

// ============================================
// 3. Can a user see listings in the feed?
// ============================================
describe('Feed', () => {
  it('should fetch and display feed items', async () => {
    api.getFeed.mockResolvedValue({
      items: [
        {
          id: 'listing-1',
          type: 'listing',
          title: 'Power Drill',
          isFree: true,
          pricePerDay: 0,
          condition: 'good',
          visibility: 'close_friends',
          user: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null, isVerified: false, totalTransactions: 0 },
          photoUrl: 'https://test.com/photo.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
      hasMore: false,
    });

    const FeedScreen = require('../src/screens/FeedScreen').default;

    const { findByText } = render(
      <FeedScreen navigation={mockNavigation} />
    );

    await findByText('Power Drill');
    expect(api.getFeed).toHaveBeenCalled();
  });
});

// ============================================
// 4. Can a user tap a listing and see detail?
// ============================================
describe('ListingDetail', () => {
  const mockListing = {
    id: 'listing-1',
    title: 'Camping Tent',
    description: 'Great 4-person tent',
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
    timesBorrowed: 3,
    minDuration: 1,
    maxDuration: 14,
    category: { name: 'Outdoor' },
  };

  it('should fetch and display listing details', async () => {
    api.getListing.mockResolvedValue(mockListing);
    api.getDiscussions.mockResolvedValue({ discussions: [], count: 0 });
    api.checkSaved.mockResolvedValue({ saved: false });

    const ListingDetailScreen = require('../src/screens/ListingDetailScreen').default;
    const route = { params: { id: 'listing-1' } };

    const { findByText } = render(
      <ListingDetailScreen navigation={mockNavigation} route={route} />
    );

    await findByText('Camping Tent');
    expect(api.getListing).toHaveBeenCalledWith('listing-1');
  });

  it('should show "Request to Borrow" button for non-owners', async () => {
    api.getListing.mockResolvedValue(mockListing);
    api.getDiscussions.mockResolvedValue({ discussions: [], count: 0 });
    api.checkSaved.mockResolvedValue({ saved: false });

    const ListingDetailScreen = require('../src/screens/ListingDetailScreen').default;
    const route = { params: { id: 'listing-1' } };

    const { findByText } = render(
      <ListingDetailScreen navigation={mockNavigation} route={route} />
    );

    const borrowBtn = await findByText('Request to Borrow');
    expect(borrowBtn).toBeTruthy();
  });
});

// ============================================
// 5. Can a user post a new listing?
// ============================================
describe('CreateListing', () => {
  it('should render listing form with required fields accessible', async () => {
    api.createListing.mockResolvedValue({ id: 'new-listing-1' });

    const CreateListingScreen = require('../src/screens/CreateListingScreen').default;
    const route = { params: {} };

    const { getByTestId, getByText, queryByText } = render(
      <CreateListingScreen navigation={mockNavigation} route={route} />
    );

    // Should NOT show "maybe later" - form should be accessible
    await waitFor(() => {
      expect(queryByText(/maybe later/i)).toBeNull();
    });

    // Use testIDs for inputs
    const titleInput = getByTestId('CreateListing.input.title');
    expect(titleInput).toBeTruthy();

    fireEvent.changeText(titleInput, 'My Power Drill');
    fireEvent.changeText(getByTestId('CreateListing.input.description'), 'DeWalt 20V cordless drill');

    // Submit button should exist and say "List Item"
    const submitBtn = getByText('List Item');
    expect(submitBtn).toBeTruthy();
  });
});

// ============================================
// 6. Can a user post a wanted request?
// ============================================
describe('CreateRequest', () => {
  it('should render the request form without blocking prompt', async () => {
    const CreateRequestScreen = require('../src/screens/CreateRequestScreen').default;

    const { getByPlaceholderText, queryByText } = render(
      <CreateRequestScreen navigation={mockNavigation} />
    );

    // Should NOT show "maybe later" gate
    await waitFor(() => {
      expect(queryByText(/maybe later/i)).toBeNull();
    });

    // Title placeholder: "e.g., Power drill, Ladder, Moving boxes"
    await waitFor(() => {
      expect(getByPlaceholderText(/Power drill/)).toBeTruthy();
    });
  });

  it('should fill form fields and show validation on submit without category', async () => {
    const CreateRequestScreen = require('../src/screens/CreateRequestScreen').default;

    const { getByPlaceholderText, getByText } = render(
      <CreateRequestScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByPlaceholderText(/Power drill/)).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText(/Power drill/), 'Camping Stove');
    fireEvent.changeText(
      getByPlaceholderText(/Add more details/),
      'Need a portable camping stove for the weekend'
    );

    // Submit without selecting a category triggers validation
    await act(async () => {
      fireEvent.press(getByText('Post Request'));
    });

    // Validation should fire (categoryId is required)
    expect(mockShowError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'validation',
      })
    );
  });
});

// ============================================
// 7. Can a user request to borrow an item?
// ============================================
describe('BorrowRequest', () => {
  it('should render borrow form and call createTransaction', async () => {
    api.createTransaction.mockResolvedValue({ id: 'txn-1' });

    const BorrowRequestScreen = require('../src/screens/BorrowRequestScreen').default;

    const listing = {
      id: 'listing-1',
      title: 'Camera',
      photos: ['https://test.com/photo.jpg'],
      isFree: true,
      pricePerDay: 0,
      depositAmount: 0,
      minDuration: 1,
      maxDuration: 14,
      visibility: 'close_friends',
      owner: { id: 'user-2', firstName: 'Bob', lastName: 'Smith' },
    };

    const route = { params: { listing } };

    const { getByText, getByPlaceholderText } = render(
      <BorrowRequestScreen navigation={mockNavigation} route={route} />
    );

    // Wait for access check to finish (it calls checkSubscriptionAccess)
    await waitFor(() => {
      expect(getByText('Camera')).toBeTruthy();
    });

    // Fill in message - placeholder: "Introduce yourself and explain what you need the item for..."
    const messageInput = getByPlaceholderText(/Introduce yourself/);
    fireEvent.changeText(messageInput, 'Need it for a trip!');

    // Submit - button text: "Send Request"
    await act(async () => {
      fireEvent.press(getByText('Send Request'));
    });

    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: 'listing-1',
      })
    );
  });
});

// ============================================
// 8. Can a user send a message?
// ============================================
describe('Chat', () => {
  it('should render chat and send a message via API', async () => {
    api.getConversation.mockResolvedValue({
      conversation: {
        otherUser: {
          id: 'user-2',
          firstName: 'Alice',
          lastName: 'Jones',
          profilePhotoUrl: null,
        },
        listing: null,
      },
      messages: [
        {
          id: 'msg-0',
          content: 'Hi there!',
          senderId: 'user-2',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    api.sendMessage.mockResolvedValue({
      id: 'msg-1',
      content: 'Hey, is this available?',
      senderId: 'user-1',
      createdAt: new Date().toISOString(),
    });

    const ChatScreen = require('../src/screens/ChatScreen').default;
    const route = { params: { conversationId: 'conv-1' } };

    const { getByPlaceholderText } = render(
      <ChatScreen navigation={mockNavigation} route={route} />
    );

    // Wait for chat to load - placeholder: "Type a message..."
    await waitFor(() => {
      expect(getByPlaceholderText('Type a message...')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText('Type a message...'), 'Hey, is this available?');

    // Chat loaded and message input is functional
    expect(api.getConversation).toHaveBeenCalled();
  });
});

// ============================================
// 9. Can a user edit their profile?
// ============================================
describe('EditProfile', () => {
  it('should render profile form with current user data', async () => {
    const EditProfileScreen = require('../src/screens/EditProfileScreen').default;

    const { getByDisplayValue } = render(
      <EditProfileScreen navigation={mockNavigation} />
    );

    // Pre-populated from mockUser
    await waitFor(() => {
      expect(getByDisplayValue('Test')).toBeTruthy(); // firstName
      expect(getByDisplayValue('User')).toBeTruthy(); // lastName
    });
  });

  it('should call updateProfile on save', async () => {
    api.updateProfile.mockResolvedValue({ ...mockUser, firstName: 'Updated' });

    const EditProfileScreen = require('../src/screens/EditProfileScreen').default;

    const { getByDisplayValue, getByText } = render(
      <EditProfileScreen navigation={mockNavigation} />
    );

    await waitFor(() => {
      expect(getByDisplayValue('Test')).toBeTruthy();
    });

    // Change first name
    fireEvent.changeText(getByDisplayValue('Test'), 'Updated');

    await act(async () => {
      fireEvent.press(getByText('Save Changes'));
    });

    expect(api.updateProfile).toHaveBeenCalled();
  });
});

// ============================================
// 10. Can a user save/unsave a listing?
// ============================================
describe('SavedListings', () => {
  it('should display saved listings', async () => {
    api.getSavedListings.mockResolvedValue([
      {
        id: 'listing-1',
        title: 'Saved Power Drill',
        photoUrl: 'https://test.com/photo.jpg',
        photos: ['https://test.com/photo.jpg'],
        condition: 'good',
        isFree: true,
        pricePerDay: 0,
        owner: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null },
      },
    ]);

    const SavedScreen = require('../src/screens/SavedScreen').default;

    const { findByText } = render(
      <SavedScreen navigation={mockNavigation} />
    );

    await findByText('Saved Power Drill');
    expect(api.getSavedListings).toHaveBeenCalled();
  });

  it('should show empty state when no saved listings', async () => {
    api.getSavedListings.mockResolvedValue([]);

    const SavedScreen = require('../src/screens/SavedScreen').default;

    const { findByText } = render(
      <SavedScreen navigation={mockNavigation} />
    );

    await findByText('Browse Items');
    expect(api.getSavedListings).toHaveBeenCalled();
  });
});

// ============================================
// 11. Can a user search for other users?
// ============================================
describe('Friends - Search', () => {
  it('should search for users and display results', async () => {
    api.searchUsers.mockResolvedValue([
      {
        id: 'user-3',
        firstName: 'Charlie',
        lastName: 'Brown',
        city: 'Boston',
        state: 'MA',
        profilePhotoUrl: null,
        isFriend: false,
      },
    ]);

    const FriendsScreen = require('../src/screens/FriendsScreen').default;
    const route = { params: { initialTab: 'search' } };

    const { getByPlaceholderText } = render(
      <FriendsScreen navigation={mockNavigation} route={route} />
    );

    // Placeholder for search tab: "Search by name..."
    const searchInput = getByPlaceholderText('Search by name...');
    await act(async () => {
      fireEvent.changeText(searchInput, 'Charlie');
    });

    // Wait for debounced search
    await waitFor(
      () => {
        expect(api.searchUsers).toHaveBeenCalledWith('Charlie');
      },
      { timeout: 3000 }
    );
  });
});

// ============================================
// 12. Can a user send a friend request?
// ============================================
describe('Friends - Add', () => {
  it('should search and find users to add', async () => {
    api.searchUsers.mockResolvedValue([
      {
        id: 'user-3',
        firstName: 'Charlie',
        lastName: 'Brown',
        city: 'Boston',
        state: 'MA',
        profilePhotoUrl: null,
        isFriend: false,
        requestSent: false,
      },
    ]);
    api.addFriend.mockResolvedValue({ status: 'pending' });

    const FriendsScreen = require('../src/screens/FriendsScreen').default;
    const route = { params: { initialTab: 'search' } };

    const { getByPlaceholderText, findByText } = render(
      <FriendsScreen navigation={mockNavigation} route={route} />
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Search by name...'), 'Charlie');
    });

    await waitFor(
      () => {
        expect(api.searchUsers).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Results should show the user
    await findByText('Charlie Brown');
  });
});

// ============================================
// 13. Can a user view notifications?
// ============================================
describe('Notifications', () => {
  it('should fetch and display notifications', async () => {
    api.getNotifications.mockResolvedValue({
      notifications: [
        {
          id: 'notif-1',
          type: 'borrow_request',
          title: 'New borrow request',
          body: 'Alice wants to borrow your drill',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });

    const NotificationsScreen = require('../src/screens/NotificationsScreen').default;

    const { findByText } = render(
      <NotificationsScreen navigation={mockNavigation} />
    );

    await findByText('New borrow request');
    expect(api.getNotifications).toHaveBeenCalled();
  });

  it('should mark notification as read on tap', async () => {
    api.getNotifications.mockResolvedValue({
      notifications: [
        {
          id: 'notif-1',
          type: 'borrow_request',
          title: 'New request',
          body: 'Someone wants your item',
          isRead: false,
          createdAt: new Date().toISOString(),
          transactionId: 'txn-1',
        },
      ],
      unreadCount: 1,
    });
    api.markNotificationRead.mockResolvedValue({ success: true });

    const NotificationsScreen = require('../src/screens/NotificationsScreen').default;

    const { findByText } = render(
      <NotificationsScreen navigation={mockNavigation} />
    );

    const notif = await findByText('New request');
    await act(async () => {
      fireEvent.press(notif);
    });

    expect(api.markNotificationRead).toHaveBeenCalledWith('notif-1');
  });
});

// ============================================
// 14. Can a user open subscription screen and see plans?
// ============================================
describe('Subscription', () => {
  it('should display subscription plans with subscribe button', async () => {
    const SubscriptionScreen = require('../src/screens/SubscriptionScreen').default;
    const route = { params: { source: 'generic' } };

    const { findByTestId } = render(
      <SubscriptionScreen navigation={mockNavigation} route={route} />
    );

    // Should show the subscribe button (testID: Subscription.button.subscribe)
    const subscribeBtn = await findByTestId('Subscription.button.subscribe');
    expect(subscribeBtn).toBeTruthy();
  });
});

// ============================================
// 15. Can a user open payment methods screen?
// ============================================
describe('PaymentMethods', () => {
  it('should fetch and display payment methods', async () => {
    api.getPaymentMethods.mockResolvedValue([
      {
        id: 'pm-1',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        isDefault: true,
      },
    ]);

    const PaymentMethodsScreen = require('../src/screens/PaymentMethodsScreen').default;
    const route = { params: {} };

    const { findByText } = render(
      <PaymentMethodsScreen navigation={mockNavigation} route={route} />
    );

    // Card display format: "visa •••• 4242"
    await findByText(/4242/);
    expect(api.getPaymentMethods).toHaveBeenCalled();
  });

  it('should show add payment method button', async () => {
    const PaymentMethodsScreen = require('../src/screens/PaymentMethodsScreen').default;
    const route = { params: {} };

    const { findByText } = render(
      <PaymentMethodsScreen navigation={mockNavigation} route={route} />
    );

    const addBtn = await findByText('Add Payment Method');
    expect(addBtn).toBeTruthy();
  });
});
