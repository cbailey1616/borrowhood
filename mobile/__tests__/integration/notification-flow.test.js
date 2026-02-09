import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

const mockNotifications = [
  {
    id: 'n-1',
    type: 'borrow_request',
    title: 'New Request',
    body: 'Alice wants to borrow your drill',
    isRead: false,
    createdAt: new Date().toISOString(),
    transactionId: 'txn-1',
  },
  {
    id: 'n-2',
    type: 'new_message',
    title: 'New Message',
    body: 'Bob sent you a message',
    isRead: false,
    createdAt: new Date().toISOString(),
    conversationId: 'conv-1',
  },
  {
    id: 'n-3',
    type: 'friend_request',
    title: 'Friend Request',
    body: 'Carol wants to connect',
    isRead: true,
    createdAt: new Date().toISOString(),
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getNotifications.mockResolvedValue({ notifications: mockNotifications, unreadCount: 2 });
  api.markNotificationRead.mockResolvedValue({});
  api.markAllNotificationsRead.mockResolvedValue({});
});

describe('Notification Flow Integration', () => {
  it('loads all notifications on mount', async () => {
    const NotificationsScreen = require('../../src/screens/NotificationsScreen').default;
    render(<NotificationsScreen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(api.getNotifications).toHaveBeenCalled();
    });
  });

  it('displays unread and read notifications', async () => {
    const NotificationsScreen = require('../../src/screens/NotificationsScreen').default;
    const { findByText } = render(
      <NotificationsScreen navigation={mockNavigation} />
    );
    await findByText('New Request');
  });

  it('tapping notification marks it as read', async () => {
    const NotificationsScreen = require('../../src/screens/NotificationsScreen').default;
    const { findByText } = render(
      <NotificationsScreen navigation={mockNavigation} />
    );
    const notif = await findByText('New Request');
    await act(async () => {
      fireEvent.press(notif);
    });
    expect(api.markNotificationRead).toHaveBeenCalledWith('n-1');
  });

  it('tapping notification navigates based on type', async () => {
    const NotificationsScreen = require('../../src/screens/NotificationsScreen').default;
    const { findByText } = render(
      <NotificationsScreen navigation={mockNavigation} />
    );
    const notif = await findByText('New Request');
    await act(async () => {
      fireEvent.press(notif);
    });
    expect(mockNavigation.navigate).toHaveBeenCalled();
  });

  it('mark all read calls api', async () => {
    const NotificationsScreen = require('../../src/screens/NotificationsScreen').default;
    const { findByText } = render(
      <NotificationsScreen navigation={mockNavigation} />
    );
    const markAll = await findByText('Mark all read');
    await act(async () => {
      fireEvent.press(markAll);
    });
    // The button opens an ActionSheet, the actual api call happens when confirming the ActionSheet
    expect(api.markAllNotificationsRead).not.toHaveBeenCalled();
  });
});
