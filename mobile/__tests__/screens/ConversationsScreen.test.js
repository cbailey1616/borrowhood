import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getConversations.mockResolvedValue([]); });
describe('ConversationsScreen', () => {
  it('fetches conversations on mount', async () => {
    const Screen = require('../../src/screens/ConversationsScreen').default;
    render(<Screen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getConversations).toHaveBeenCalled(); });
  });
  it('shows empty state', async () => {
    const Screen = require('../../src/screens/ConversationsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('No messages yet');
  });
  it('displays conversation list', async () => {
    api.getConversations.mockResolvedValue([{ id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null }, lastMessage: 'Hey!', lastMessageAt: new Date().toISOString(), unreadCount: 0 }]);
    const Screen = require('../../src/screens/ConversationsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText(/Alice/);
  });
  it('tap navigates to Chat', async () => {
    api.getConversations.mockResolvedValue([{ id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null }, lastMessage: 'Hey!', lastMessageAt: new Date().toISOString(), unreadCount: 0 }]);
    const Screen = require('../../src/screens/ConversationsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    const item = await findByText(/Alice/);
    fireEvent.press(item);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.anything());
  });
  it('shows the latest message without a fixed item label or stored context prefix', async () => {
    api.getConversations.mockResolvedValue([{ id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice' }, listing: { title: 'Old ladder' },
      lastMessage: 'About item: “Garden chairs”\n\nAre these available?', lastMessageAt: new Date().toISOString(), unreadCount: 0 }]);
    const Screen = require('../../src/screens/ConversationsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Are these available?');
    expect(screen.queryByText('Old ladder')).toBeNull();
    expect(screen.queryByText(/About item:/)).toBeNull();
  });
});
