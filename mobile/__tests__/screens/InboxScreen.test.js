import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null,
  onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5,
};

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
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
  api.getTransactions.mockResolvedValue([]);
  api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 });
});

describe('InboxScreen', () => {
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

  it('displays conversations', async () => {
    api.getConversations.mockResolvedValue([{
      id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
      lastMessage: 'Hey!', lastMessageAt: new Date().toISOString(),
      unreadCount: 1, listing: null,
    }]);
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    await findByText('Alice Jones');
  });

  it('activity tab calls api.getTransactions', async () => {
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    const activityTab = await findByText('Activity');
    await act(async () => {
      fireEvent.press(activityTab);
    });
    await waitFor(() => {
      expect(api.getTransactions).toHaveBeenCalled();
    });
  });

  it('empty messages state', async () => {
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    await findByText(/no messages/i);
  });

  it('tap conversation navigates to Chat', async () => {
    api.getConversations.mockResolvedValue([{
      id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
      lastMessage: 'Hello', lastMessageAt: new Date().toISOString(),
      unreadCount: 0, listing: null,
    }]);
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    const conv = await findByText('Alice Jones');
    fireEvent.press(conv);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'conv-1' }));
  });
});
