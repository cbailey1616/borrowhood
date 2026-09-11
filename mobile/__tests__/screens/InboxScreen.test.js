import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import * as Notifications from 'expo-notifications';

const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null,
  onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5,
};

const mockParentNavigate = jest.fn();
const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn(), navigate: mockParentNavigate }),
  dispatch: jest.fn(), canGoBack: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.getConversations.mockResolvedValue([]);
  api.getNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
  api.getTransactions.mockResolvedValue([]);
  api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 });
});

describe('InboxScreen', () => {
  it('opens Activity, groups one item’s requests, and keeps message and activity counts separate', async () => {
    const pending = ['alice', 'bob'].map((id, index) => ({ id: `request-${index}`, status: 'pending', isBorrower: false,
      listing: { id: 'tea', title: 'Tea' }, borrower: { id, firstName: id }, lender: mockUser }));
    api.getTransactions.mockResolvedValue([...pending, { id: 'accepted', status: 'approved', isBorrower: false,
      listing: { id: 'drill', title: 'Drill' }, borrower: { id: 'sam', firstName: 'Sam', isVerified: true } }]);
    api.getNotifications.mockResolvedValue({ notifications: pending.map((t, index) => ({ id: `n-${index}`, type: 'giveaway_claim',
      transactionId: t.id, listingId: 'tea', fromUserId: t.borrower.id, fromUser: t.borrower,
      title: 'Someone wants your item', isRead: false, createdAt: new Date().toISOString() })), unreadCount: 2 });
    api.getConversations.mockResolvedValue([{ id: 'chat', otherUser: { firstName: 'Alex' }, unreadCount: 2 }]);
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('2 people requested Tea');
    expect(screen.getByText('Activity (1)')).toBeTruthy();
    expect(screen.getByText('Messages (2)')).toBeTruthy();
    expect(screen.getAllByText('Tea')).toHaveLength(1);
    expect(screen.getByText('2 people waiting')).toBeTruthy();
    expect(api.markNotificationRead).not.toHaveBeenCalled();
    expect(api.markConversationRead).not.toHaveBeenCalled();
    expect(Notifications.dismissAllNotificationsAsync).not.toHaveBeenCalled();
    expect(Notifications.setBadgeCountAsync).not.toHaveBeenCalledWith(0);
    await act(async () => fireEvent.press(screen.getByLabelText('See queue for Tea, 2 waiting')));
    expect(mockParentNavigate).toHaveBeenLastCalledWith('RequestQueue', { listingId: 'tea' });
    fireEvent.press(screen.getByLabelText('View exchange for Drill'));
    expect(mockParentNavigate).toHaveBeenLastCalledWith('TransactionDetail', { id: 'accepted' });
    await act(async () => fireEvent.press(screen.getByText('2 people requested Tea')));
    expect(api.markNotificationRead).toHaveBeenCalledWith('n-0');
    expect(api.markNotificationRead).toHaveBeenCalledWith('n-1');
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Messages (2)')).toBeTruthy();
  });

  it('renders SegmentedControl with Messages/Activity tabs', async () => {
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByTestId } = render(<InboxScreen navigation={mockNavigation} />);
    const segment = await findByTestId('Inbox.segment');
    expect(segment).toBeTruthy();
  });

  it('messages tab calls api.getConversations', async () => {
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    render(<InboxScreen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(api.getConversations).toHaveBeenCalled();
    });
  });

  it('displays conversations on Messages tab', async () => {
    api.getConversations.mockResolvedValue([{
      id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
      lastMessage: 'Hey!', lastMessageAt: new Date().toISOString(),
      unreadCount: 1, listing: null,
    }]);
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    // Switch to Messages tab (index 1)
    const messagesTab = await findByText(/^Messages/);
    await act(async () => {
      fireEvent.press(messagesTab);
    });
    await findByText('Alice Jones');
  });

  it('fetches notifications and conversations on load', async () => {
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    render(<InboxScreen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(api.getNotifications).toHaveBeenCalled();
      expect(api.getConversations).toHaveBeenCalled();
    });
  });

  it('empty messages state on Messages tab', async () => {
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    // Switch to Messages tab
    const messagesTab = await findByText(/^Messages/);
    await act(async () => {
      fireEvent.press(messagesTab);
    });
    await findByText(/No messages yet/i);
  });

  it('opens a request reply notification in that request’s public thread', async () => {
    api.getNotifications.mockResolvedValue({ notifications: [{ id: 'n-1', type: 'discussion_reply', title: 'New reply', body: 'A neighbor replied about your ladder.', requestId: 'request-1', isRead: true, createdAt: new Date().toISOString() }], unreadCount: 0 });
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    const activity = await screen.findByText('Activity');
    await act(async () => fireEvent.press(activity));
    fireEvent.press(await screen.findByText('New reply'));
    expect(mockParentNavigate).toHaveBeenCalledWith('ListingDiscussion', { requestId: 'request-1' });
  });

  it('keeps active exchanges out of Messages and opens their details from Activity', async () => {
    api.getTransactions.mockResolvedValue([{ id: 'exchange-1', status: 'pending', isBorrower: true, listing: { title: 'TheraGun' }, lender: { firstName: 'Sam' } }]);
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByText('Messages'));
    expect(screen.queryByText('TheraGun')).toBeNull();
    fireEvent.press(screen.getByText('Activity'));
    fireEvent.press(await screen.findByText('TheraGun'));
    expect(mockParentNavigate).toHaveBeenCalledWith('TransactionDetail', { id: 'exchange-1' });
    expect(mockParentNavigate).not.toHaveBeenCalledWith('Chat', expect.anything());
  });

  it('tap conversation navigates to Chat', async () => {
    api.getConversations.mockResolvedValue([{
      id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
      lastMessage: 'Hello', lastMessageAt: new Date().toISOString(),
      unreadCount: 0, listing: null,
    }]);
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    // Switch to Messages tab first
    const messagesTab = await findByText(/^Messages/);
    await act(async () => {
      fireEvent.press(messagesTab);
    });
    const conv = await findByText('Alice Jones');
    fireEvent.press(conv);
    // InboxScreen uses navigation.getParent().navigate for Chat navigation
    expect(mockParentNavigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'conv-1' }));
  });
});
