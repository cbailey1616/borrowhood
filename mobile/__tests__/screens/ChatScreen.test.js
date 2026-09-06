import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import * as SecureStore from 'expo-secure-store';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 88 }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); SecureStore.getItemAsync.mockResolvedValue(null); SecureStore.setItemAsync.mockResolvedValue(); api.getMessageCapabilities.mockResolvedValue({ idempotentMessages: false }); api.getConversation.mockResolvedValue({ conversation: { id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null } }, messages: [] }); api.sendMessage.mockResolvedValue({ id: 'msg-1' }); });
describe('ChatScreen', () => {
  const route = { params: { conversationId: 'conv-1' } };
  it('fetches conversation on mount', async () => {
    const Screen = require('../../src/screens/ChatScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getConversation).toHaveBeenCalledWith('conv-1'); });
  });
  it('renders message input', async () => {
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByPlaceholderText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByPlaceholderText('Message…');
  });
  it('displays messages', async () => {
    api.getConversation.mockResolvedValue({ conversation: { id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null } }, messages: [{ id: 'msg-1', content: 'Hello there!', senderId: 'user-2', createdAt: new Date().toISOString() }] });
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Hello there!');
  });
  it('send button calls api.sendMessage', async () => {
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByPlaceholderText, getByLabelText } = render(<Screen navigation={mockNavigation} route={route} />);
    const input = await findByPlaceholderText('Message…');
    fireEvent.changeText(input, 'Hi!');
    await waitFor(() => expect(getByLabelText('Send message')).not.toBeDisabled());
    await act(async () => { fireEvent.press(getByLabelText('Send message')); });
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Hi!' }));
  });

  it('retries an uncertain send using the same immutable key and preserves newly typed text', async () => {
    api.getMessageCapabilities.mockResolvedValue({ idempotentMessages: true });
    api.sendMessage.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'msg-1' });
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByPlaceholderText, getByLabelText, findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    const input = await findByPlaceholderText('Message…');
    fireEvent.changeText(input, 'Hi!');
    await waitFor(() => expect(getByLabelText('Send message')).not.toBeDisabled());
    await act(async () => fireEvent.press(getByLabelText('Send message')));
    const retry = await findByText('Retry send');
    fireEvent.changeText(input, 'Another thought');
    await act(async () => fireEvent.press(retry));
    expect(api.sendMessage.mock.calls[0][0]).toEqual(api.sendMessage.mock.calls[1][0]);
    expect(api.sendMessage.mock.calls[0][0].clientRequestId).toBeTruthy();
    expect(input.props.value).toBe('Another thought');
  });

  it('does not offer duplicate-prone retries against an older backend', async () => {
    api.sendMessage.mockRejectedValueOnce(new Error('timeout'));
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByPlaceholderText, getByLabelText, findByText, queryByText } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(await findByPlaceholderText('Message…'), 'Hi!');
    await waitFor(() => expect(getByLabelText('Send message')).not.toBeDisabled());
    await act(async () => fireEvent.press(getByLabelText('Send message')));
    await findByText('Clear after checking');
    expect(queryByText('Retry send')).toBeNull();
    expect(getByLabelText('Send message')).toBeDisabled();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not send if its recovery record could not be stored', async () => {
    SecureStore.setItemAsync.mockRejectedValue(new Error('full'));
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByPlaceholderText, getByLabelText, findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(await findByPlaceholderText('Message…'), 'Hi!');
    await waitFor(() => expect(getByLabelText('Send message')).not.toBeDisabled());
    await act(async () => fireEvent.press(getByLabelText('Send message')));
    await findByText(/Nothing was sent/);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('restores a pending send when a new chat is reopened from Inbox', async () => {
    const values = new Map();
    SecureStore.getItemAsync.mockImplementation(async key => values.get(key) ?? null);
    SecureStore.setItemAsync.mockImplementation(async (key, value) => { values.set(key, value); });
    api.getMessageCapabilities.mockResolvedValue({ idempotentMessages: true });
    api.sendMessage.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'msg-1' });
    const Screen = require('../../src/screens/ChatScreen').default;
    const first = render(<Screen navigation={mockNavigation} route={{ params: { recipientId: 'user-2' } }} />);
    fireEvent.changeText(await first.findByPlaceholderText('Message…'), 'Keep this attempt');
    await waitFor(() => expect(first.getByLabelText('Send message')).not.toBeDisabled());
    await act(async () => fireEvent.press(first.getByLabelText('Send message')));
    await first.findByText('Retry send');
    first.unmount();
    const reopened = render(<Screen navigation={mockNavigation} route={route} />);
    const retry = await reopened.findByText('Retry send');
    await act(async () => fireEvent.press(retry));
    expect(api.sendMessage.mock.calls[1][0]).toEqual(api.sendMessage.mock.calls[0][0]);
  });
});
