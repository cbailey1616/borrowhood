import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import * as Notifications from 'expo-notifications';
import { FlatList, RefreshControl } from 'react-native';

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
  api.markAllNotificationsRead.mockResolvedValue({});
  api.markConversationRead.mockResolvedValue({});
  api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 });
});

describe('InboxScreen', () => {
  it('opens Messages automatically when its unread messages explain the inbox badge', async () => {
    api.getConversations.mockResolvedValue([{ id: 'chat', otherUser: { firstName: 'Alex', lastName: 'B.' }, unreadCount: 2, lastMessage: 'Can we meet at noon?' }]);
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Can we meet at noon?');
    expect(screen.getByRole('tab', { name: 'Messages (2)' }).props.accessibilityState.selected).toBe(true);
    expect(api.markConversationRead).not.toHaveBeenCalled();
  });

  it('honors a requested inbox tab and keeps a later manual choice on refresh', async () => {
    api.getConversations.mockResolvedValue([{ id: 'chat', otherUser: { firstName: 'Alex' }, unreadCount: 2 }]);
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { tab: 'activity' } }} />);
    await screen.findByText('Unread only');
    screen.rerender(<Screen navigation={mockNavigation} route={{ params: { tab: 'messages' } }} />);
    await screen.findByText('2 unread');
    fireEvent.press(screen.getByText('Activity'));
    await act(async () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
    expect(screen.getByRole('tab', { name: 'Activity' }).props.accessibilityState.selected).toBe(true);
  });

  it('keeps activity and messages available when exchanges fail and offers a visible retry', async () => {
    api.getTransactions.mockRejectedValueOnce(new Error('Offline'));
    api.getNotifications.mockResolvedValue({ notifications: [{ id: 'alert', type: 'friend_accepted', title: 'Alex accepted', isRead: false }], unreadCount: 1 });
    api.getConversations.mockResolvedValue([{ id: 'chat', otherUser: { firstName: 'Alex', lastName: 'B.' }, lastMessage: 'Hello', unreadCount: 1 }]);
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Alex accepted');
    await screen.findByText('Couldn’t refresh exchanges.');
    await act(async () => fireEvent.press(screen.getByText('Retry')));
    expect(api.getTransactions).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText('Couldn’t refresh exchanges.')).toBeNull());
    fireEvent.press(screen.getByText('Messages (1)'));
    await screen.findByText('Hello');
  });

  it('reaches an old unread alert directly even when the first page contains only read updates', async () => {
    const read = Array.from({ length: 50 }, (_, index) => ({ id: `read-${index}`, type: 'friend_accepted', title: `Read update ${index}`, isRead: true }));
    const old = { id: 'old', type: 'friend_request', title: 'An older friend request', isRead: false };
    api.getNotifications.mockImplementation(({ unreadOnly }) => Promise.resolve({ notifications: unreadOnly ? [old] : read, unreadCount: 1 }));
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Activity (1)');
    fireEvent.press(screen.getByText('Unread only'));
    await screen.findByText('An older friend request');
    expect(api.getNotifications).toHaveBeenLastCalledWith({ page: 1, limit: 50, unreadOnly: 'true' });
    expect(screen.queryByText('Read update 0')).toBeNull();
    fireEvent.press(screen.getByText('Show all activity'));
    await screen.findByText('Read update 0');
  });

  it('loads older activity and preserves the loaded history on refresh', async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({ id: `read-${index}`, type: 'friend_accepted', title: `Read update ${index}`, isRead: true }));
    const old = { id: 'old', type: 'friend_request', title: 'An older friend request', isRead: false };
    api.getNotifications.mockImplementation(({ page }) => Promise.resolve({ notifications: page === 2 ? [old] : first, unreadCount: 1 }));
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByText('Show older updates'));
    await waitFor(() => expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(51));
    expect(screen.UNSAFE_getByType(FlatList).props.data.at(-1)).toEqual(old);
    expect(api.getNotifications).toHaveBeenCalledWith({ page: 2, limit: 50 });
    await act(async () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
    expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(51);
    expect(screen.queryByText('Show older updates')).toBeNull();
  });

  it('marks only Messages read and keeps a new conversation unread when it arrives during the update', async () => {
    const first = { id: 'chat', otherUser: { firstName: 'Alex' }, unreadCount: 2 };
    api.getConversations.mockResolvedValue([first]);
    let finishRead;
    api.markConversationRead.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByText('Mark all read'));
    expect(api.markConversationRead).toHaveBeenCalledWith('chat');
    api.getConversations.mockResolvedValue([{ ...first, unreadCount: 0 }, { id: 'new-chat', otherUser: { firstName: 'Sam' }, unreadCount: 1 }]);
    await act(async () => finishRead({}));
    expect(screen.getByText('Messages (1)')).toBeTruthy();
    expect(api.markAllNotificationsRead).not.toHaveBeenCalled();
    expect(api.markConversationRead).not.toHaveBeenCalledWith('new-chat');
  });

  it('opens an alert immediately while its read acknowledgement is still pending', async () => {
    api.getNotifications.mockResolvedValue({ notifications: [{ id: 'alert', type: 'request_approved', title: 'Your request was approved', transactionId: 'exchange', isRead: false }], unreadCount: 1 });
    let finishRead;
    api.markNotificationRead.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByText('Your request was approved'));
    expect(mockParentNavigate).toHaveBeenCalledWith('TransactionDetail', { id: 'exchange' });
    await act(async () => finishRead({}));
  });

  it.each(['rank_up', 'rank_down', 'rank_ready'])('opens %s in the personal rating explanation', async type => {
    api.getNotifications.mockResolvedValue({ notifications: [{ id: 'rank-alert', type, title: 'Neighbor rating update', isRead: false }], unreadCount: 1 });
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByText('Neighbor rating update'));
    await waitFor(() => expect(mockParentNavigate).toHaveBeenCalledWith('Main', { screen: 'Profile', params: { openRating: true } }));
    expect(api.markNotificationRead).toHaveBeenCalledWith('rank-alert');
  });
  it('keeps an alert that arrives after the server processes Mark all read unread', async () => {
    const first = { id: 'first', type: 'friend_accepted', title: 'Alex accepted', isRead: false };
    api.getNotifications.mockResolvedValue({ notifications: [first], unreadCount: 1 });
    api.getConversations.mockResolvedValue([{ id: 'chat', otherUser: { firstName: 'Alex' }, unreadCount: 2 }]);
    let finishRead;
    api.markAllNotificationsRead.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByText('Mark all read'));
    api.getNotifications.mockResolvedValue({ notifications: [{ ...first, isRead: true },
      { id: 'new', type: 'friend_accepted', title: 'Sam accepted', isRead: false }], unreadCount: 1 });
    await act(async () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
    await screen.findByText('Sam accepted');
    await act(async () => finishRead({}));
    expect(screen.getByText('Activity (1)')).toBeTruthy();
    expect(screen.getByText('Messages (2)')).toBeTruthy();
    expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('retains the unread badge when a refreshed group arrives while the earlier alert is being read', async () => {
    const first = { id: 'first', type: 'giveaway_claim', queueListingId: 'tea', listingId: 'tea', listingTitle: 'Tea',
      notificationIds: ['first'], requestCount: 1, fromUser: { firstName: 'Alex' }, isRead: false };
    api.getNotifications.mockResolvedValue({ notifications: [first], unreadCount: 1 });
    let finishRead;
    api.markNotificationRead.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    const Screen = require('../../src/screens/InboxScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByText('Alex requested Tea'));
    api.getNotifications.mockResolvedValue({ notifications: [{ ...first, id: 'arrived', notificationIds: ['first', 'arrived'], requestCount: 2 }], unreadCount: 1 });
    await act(async () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
    await screen.findByText('2 people requested Tea');
    await act(async () => finishRead({}));
    expect(screen.getByText('Activity (1)')).toBeTruthy();
    expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(api.markNotificationRead).toHaveBeenCalledWith('first');
  });

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
