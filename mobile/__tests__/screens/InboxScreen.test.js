import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

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

  it('displays conversations on Messages tab', async () => {
    api.getConversations.mockResolvedValue([{
      id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
      lastMessage: 'Hey!', lastMessageAt: new Date().toISOString(),
      unreadCount: 1, listing: null,
    }]);
    const InboxScreen = require('../../src/screens/InboxScreen').default;
    const { findByText } = render(<InboxScreen navigation={mockNavigation} />);
    // Switch to Messages tab (index 1)
    const messagesTab = await findByText('Messages');
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
    const messagesTab = await findByText('Messages');
    await act(async () => {
      fireEvent.press(messagesTab);
    });
    await findByText(/No messages yet/i);
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
    const messagesTab = await findByText('Messages');
    await act(async () => {
      fireEvent.press(messagesTab);
    });
    const conv = await findByText('Alice Jones');
    fireEvent.press(conv);
    // InboxScreen uses navigation.getParent().navigate for Chat navigation
    expect(mockParentNavigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'conv-1' }));
  });
});
