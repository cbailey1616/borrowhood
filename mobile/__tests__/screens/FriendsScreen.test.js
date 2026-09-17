import React from 'react';
import * as Contacts from 'expo-contacts';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockShowError = jest.fn();
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
beforeEach(() => {
  jest.clearAllMocks();
  api.getFriends.mockResolvedValue([]);
  api.getFriendRequests.mockResolvedValue([]);
  api.searchUsers.mockResolvedValue([]);
  api.acceptFriendRequest.mockReset().mockResolvedValue({});
  api.declineFriendRequest.mockReset().mockResolvedValue({});
  api.removeFriend.mockReset().mockResolvedValue({});
});
describe('FriendsScreen', () => {
  const route = { params: {} };
  it('fetches friends on mount', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getFriends).toHaveBeenCalled(); });
  });
  it('shows empty friends state', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Good neighbors start with a hello');
  });
  it('displays friend list', async () => {
    api.getFriends.mockResolvedValue([{ id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null }]);
    const Screen = require('../../src/screens/FriendsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });
  it('opens search from Add friends and returns without keeping the search filter', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Good neighbors start with a hello');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(Contacts.getPermissionsAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Add friends'));
    fireEvent.press(screen.getByLabelText('Search people'));
    expect(screen.getByPlaceholderText('Search by name...')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Search by name...'), 'Alice');
    await waitFor(() => expect(api.searchUsers).toHaveBeenCalledWith('Alice'));
    fireEvent.press(screen.getByLabelText('Back to friends'));
    expect(screen.getByText('Good neighbors start with a hello')).toBeTruthy();
    expect(Contacts.getPermissionsAsync).not.toHaveBeenCalled();
  });
  it('requests contact access only after choosing From contacts', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Good neighbors start with a hello');
    fireEvent.press(screen.getByLabelText('Add friends'));
    expect(Contacts.getPermissionsAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('From contacts'));
    await waitFor(() => expect(Contacts.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(Contacts.getContactsAsync).toHaveBeenCalledTimes(1));
  });
  it('renders requests tab', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Requests');
  });

  it('opens your personal QR code from Add without requesting contact access', async () => {
    const Screen = require('../../src/screens/FriendsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Good neighbors start with a hello');
    fireEvent.press(screen.getByLabelText('Add friends'));
    fireEvent.press(screen.getByLabelText('My QR code'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MyQRCode');
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
    expect(Contacts.getPermissionsAsync).not.toHaveBeenCalled();
  });

  const request = { id: 'alice', requestId: 'request-alice', firstName: 'Alice', lastName: 'Jones' };
  it.each([
    ['Accept', 'acceptFriendRequest'],
    ['Decline', 'declineFriendRequest'],
  ])('%s responds to the request and removes it from the pending list', async (label, method) => {
    api.getFriendRequests.mockResolvedValue([request]);
    let finishRequest;
    api[method].mockImplementationOnce(() => new Promise(resolve => { finishRequest = resolve; }));
    const Screen = require('../../src/screens/FriendsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { initialTab: 'requests' } }} />);
    await screen.findByText('Alice Jones');
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: `${label} request from Alice` }));
    expect(api[method]).toHaveBeenCalledWith('request-alice');
    expect(screen.getByLabelText('Accept request from Alice').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Decline request from Alice').props.accessibilityState.disabled).toBe(true);
    if (label === 'Accept') api.getFriends.mockResolvedValue([request]);
    await act(async () => finishRequest({}));
    expect(screen.queryByText('Alice Jones')).toBeNull();
    expect(screen.getByText('No pending requests')).toBeTruthy();
    if (label === 'Accept') {
      fireEvent.press(screen.getByRole('tab', { name: 'Friends' }));
      await screen.findByText('Alice Jones');
    }
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it('keeps a failed friend request action available to retry', async () => {
    api.getFriendRequests.mockResolvedValue([request]);
    api.declineFriendRequest.mockRejectedValueOnce(new Error('offline'));
    const Screen = require('../../src/screens/FriendsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { initialTab: 'requests' } }} />);
    await screen.findByText('Alice Jones');
    await act(async () => fireEvent.press(screen.getByLabelText('Decline request from Alice')));
    expect(mockShowError).toHaveBeenCalledWith('Could not decline request', 'Please try again.');
    expect(screen.getByText('Alice Jones')).toBeTruthy();
    expect(screen.getByLabelText('Decline request from Alice').props.accessibilityState.disabled).toBe(false);
    await act(async () => fireEvent.press(screen.getByLabelText('Decline request from Alice')));
    expect(screen.getByText('No pending requests')).toBeTruthy();
    expect(api.declineFriendRequest).toHaveBeenCalledTimes(2);
  });

  it('opens profiles separately from friendship management and confirms removal', async () => {
    api.getFriends.mockResolvedValue([request]);
    const Screen = require('../../src/screens/FriendsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Alice Jones');
    fireEvent.press(screen.getByLabelText('Manage friendship with Alice'));
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Keep friend' }));
    expect(api.removeFriend).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Alice Jones'));
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('UserProfile', { id: 'alice' });
    fireEvent.press(screen.getByLabelText('Manage friendship with Alice'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Remove friend' })));
    expect(api.removeFriend).toHaveBeenCalledWith('alice');
    expect(screen.queryByText('Alice Jones')).toBeNull();
  });
});
