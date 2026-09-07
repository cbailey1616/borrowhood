import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 88 }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); SecureStore.getItemAsync.mockResolvedValue(null); SecureStore.setItemAsync.mockResolvedValue(); api.getMessageCapabilities.mockResolvedValue({ idempotentMessages: false }); api.getConversation.mockResolvedValue({ conversation: { id: 'conv-1', otherUser: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null } }, messages: [] }); api.sendMessage.mockResolvedValue({ id: 'msg-1' }); });
describe('ChatScreen', () => {
  const route = { params: { conversationId: 'conv-1' } };
  const choosePhoto = async (screen, label = 'Choose from library') => {
    await waitFor(() => expect(screen.getByLabelText('Attach a photo')).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText('Attach a photo'));
    await act(async () => fireEvent.press(await screen.findByText(label)));
  };

  it('previews a library photo before sending it with its caption', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] });
    api.uploadImage.mockResolvedValueOnce('https://private-bucket/messages/photo.jpg');
    api.sendMessage.mockResolvedValueOnce({ id: 'photo-message', imageUrl: 'https://api.example/private-photos/signed' });
    const Screen = require('../../src/screens/ChatScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByPlaceholderText('Private message…');
    await choosePhoto(screen);
    await screen.findByText('Photo ready to send');
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByPlaceholderText('Private message…'), 'Here is the ladder');
    await act(async () => fireEvent.press(screen.getByLabelText('Send message')));
    expect(api.uploadImage).toHaveBeenCalledWith('file:///photo.jpg', 'messages');
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Here is the ladder', imageUrl: 'https://private-bucket/messages/photo.jpg' }));
    expect(screen.queryByText('Photo ready to send')).toBeNull();
    const photo = screen.UNSAFE_getAllByType(require('../../src/components/ShimmerImage').default).find(view => view.props.accessibilityLabel === 'Chat photo');
    expect(photo.props.source).toEqual({ uri: 'https://api.example/private-photos/signed' });
  });

  it('takes a camera photo and safely retries an uncertain photo-only send without uploading twice', async () => {
    api.getMessageCapabilities.mockResolvedValue({ idempotentMessages: true });
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    ImagePicker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///camera.jpg' }] });
    api.uploadImage.mockResolvedValueOnce('https://private-bucket/messages/camera.jpg');
    api.sendMessage.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'photo-message' });
    const Screen = require('../../src/screens/ChatScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByPlaceholderText('Private message…');
    await choosePhoto(screen, 'Take a photo');
    await screen.findByText('Photo ready to send');
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true }));
    await act(async () => fireEvent.press(screen.getByLabelText('Send message')));
    const retry = await screen.findByText('Retry send');
    await act(async () => fireEvent.press(retry));
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(api.sendMessage.mock.calls[0][0]).toEqual(api.sendMessage.mock.calls[1][0]);
    expect(api.sendMessage.mock.calls[0][0].content).toBeUndefined();
    expect(api.sendMessage.mock.calls[0][0].clientRequestId).toBeTruthy();
  });

  it('can remove an attachment and does not send when the picker is canceled', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///remove.jpg' }] }).mockResolvedValueOnce({ canceled: true });
    const Screen = require('../../src/screens/ChatScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByPlaceholderText('Private message…');
    await choosePhoto(screen);
    await screen.findByText('Photo ready to send');
    fireEvent.press(screen.getByLabelText('Remove attached photo'));
    await choosePhoto(screen);
    expect(screen.getByLabelText('Send message')).toBeDisabled();
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the photo and caption if uploading fails, then sends on retry', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///retry.jpg' }] });
    api.uploadImage.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('https://private-bucket/messages/retry.jpg');
    const Screen = require('../../src/screens/ChatScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const input = await screen.findByPlaceholderText('Private message…');
    fireEvent.changeText(input, 'A closer look');
    await choosePhoto(screen);
    await screen.findByText('Photo ready to send');
    await act(async () => fireEvent.press(screen.getByLabelText('Send message')));
    await screen.findByText(/Couldn’t upload the photo/);
    expect(input.props.value).toBe('A closer look');
    expect(screen.getByText('Photo ready to send')).toBeTruthy();
    expect(api.sendMessage).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByLabelText('Send message')));
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'A closer look', imageUrl: 'https://private-bucket/messages/retry.jpg' }));
  });

  it('offers the library fallback when camera permission is denied', async () => {
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const Screen = require('../../src/screens/ChatScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByPlaceholderText('Private message…');
    await choosePhoto(screen, 'Take a photo');
    await screen.findByText(/Allow camera access in Settings/);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(api.uploadImage).not.toHaveBeenCalled();
  });
  it('fetches conversation on mount', async () => {
    const Screen = require('../../src/screens/ChatScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getConversation).toHaveBeenCalledWith('conv-1'); });
  });
  it('renders message input', async () => {
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByPlaceholderText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByPlaceholderText('Private message…');
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
    const input = await findByPlaceholderText('Private message…');
    fireEvent.changeText(input, 'Hi!');
    await waitFor(() => expect(getByLabelText('Send message')).not.toBeDisabled());
    await act(async () => { fireEvent.press(getByLabelText('Send message')); });
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Hi!' }));
  });

  it('sends the visible post context to both participants and clears only the sent draft', async () => {
    const Screen = require('../../src/screens/ChatScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { ...route.params, threadContext: { id: 'request-1', type: 'request', title: 'Need a ladder', replyText: 'I have one you can use.' } } }} />);
    const input = await screen.findByPlaceholderText('Private message…');
    fireEvent.changeText(input, 'Can I pick it up tomorrow?');
    await waitFor(() => expect(screen.getByLabelText('Send message')).not.toBeDisabled());
    await act(async () => fireEvent.press(screen.getByLabelText('Send message')));
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'About request: “Need a ladder”\nReplying to: “I have one you can use.”\n\nCan I pick it up tomorrow?' }));
    expect(input.props.value).toBe('');
  });

  it('retries an uncertain send using the same immutable key and preserves newly typed text', async () => {
    api.getMessageCapabilities.mockResolvedValue({ idempotentMessages: true });
    api.sendMessage.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'msg-1' });
    const Screen = require('../../src/screens/ChatScreen').default;
    const { findByPlaceholderText, getByLabelText, findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    const input = await findByPlaceholderText('Private message…');
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
    fireEvent.changeText(await findByPlaceholderText('Private message…'), 'Hi!');
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
    fireEvent.changeText(await findByPlaceholderText('Private message…'), 'Hi!');
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
    fireEvent.changeText(await first.findByPlaceholderText('Private message…'), 'Keep this attempt');
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
