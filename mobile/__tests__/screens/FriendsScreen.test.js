import React from 'react';
import { Modal } from 'react-native';
import * as Contacts from 'expo-contacts';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getFriends.mockResolvedValue([]); api.getFriendRequests.mockResolvedValue([]); api.searchUsers.mockResolvedValue([]); });
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
});
