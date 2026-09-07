import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const defaultUser = { id: 'user-1', firstName: 'Test', lastName: 'User', displayName: 'Tester', email: 'test@test.com', phone: '555-1234', bio: 'Hello!', city: 'Boston', state: 'MA', latitude: 42.36, longitude: -71.06, isVerified: false, profilePhotoUrl: null, subscriptionTier: 'plus' };
let mockUser;
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { ...defaultUser };
  mockRefreshUser.mockReset();
  mockRefreshUser.mockResolvedValue(mockUser);
  api.updateProfile.mockResolvedValue({});
  api.uploadImage.mockResolvedValue('https://test.s3.amazonaws.com/test.jpg');
});
const openProfile = () => {
  const Screen = require('../../src/screens/EditProfileScreen').default;
  return render(<Screen navigation={mockNavigation} />);
};
const save = async screen => act(async () => fireEvent.press(screen.getByText('Save Changes')));
describe('EditProfileScreen', () => {
  it('pre-populates first name', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); expect(getByDisplayValue('Test')).toBeTruthy(); });
  it('pre-populates last name', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); expect(getByDisplayValue('User')).toBeTruthy(); });
  it('pre-populates bio', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); expect(getByDisplayValue('Hello!')).toBeTruthy(); });
  it('saves first-name edits before verification', async () => {
    const screen = openProfile();
    fireEvent.changeText(screen.getByDisplayValue('Test'), 'Updated');
    await save(screen);
    expect(api.updateProfile).toHaveBeenCalledWith({ firstName: 'Updated' });
  });
  it('first name is editable', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); fireEvent.changeText(getByDisplayValue('Test'), 'Updated'); });
  it('shows email info', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByText } = render(<S navigation={mockNavigation} />); expect(getByText(/test@test.com/)).toBeTruthy(); });
  it('rejects an empty editable legal name', async () => {
    const screen = openProfile();
    fireEvent.changeText(screen.getByDisplayValue('Test'), '');
    await save(screen);
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ type: 'validation' }));
  });
  it.each([
    ['complete identity', {}],
    ['missing locked surname', { lastName: '' }],
    ['missing locked first name', { firstName: '' }],
  ])('saves a verified display name with %s and refreshes before closing', async (_label, fields) => {
    mockUser = { ...mockUser, ...fields, isVerified: true };
    let resolveRefresh;
    mockRefreshUser.mockImplementation(() => new Promise(resolve => { resolveRefresh = resolve; }));
    const screen = openProfile();
    fireEvent.changeText(screen.getByDisplayValue('Tester'), 'New public name');
    await save(screen);
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: 'New public name' });
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    await act(async () => resolveRefresh({ ...mockUser, displayName: 'New public name' }));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockShowError).not.toHaveBeenCalled();
  });
  it('does not resend unchanged identity details when verification completes before the cached profile refreshes', async () => {
    mockUser = { ...mockUser, latitude: undefined, longitude: undefined };
    api.updateProfile.mockImplementationOnce(async data => {
      if (['firstName', 'lastName', 'city', 'state'].some(key => key in data)) {
        throw new Error('Name or address is locked to your verified identity.');
      }
      return { success: true };
    });
    const screen = openProfile();
    fireEvent.changeText(screen.getByDisplayValue('Tester'), 'New public name');
    await save(screen);
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: 'New public name' });
    expect(require('expo-location').geocodeAsync).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
  it('keeps verified identity fields locked while the display name is editable', () => {
    mockUser.isVerified = true;
    const screen = openProfile();
    for (const value of ['Test', 'User', 'Boston', 'MA']) {
      expect(screen.getByDisplayValue(value).props.editable).toBe(false);
    }
    expect(screen.getByDisplayValue('Tester').props.editable).not.toBe(false);
  });
  it('still geocodes a location edit when only the city changes', async () => {
    mockUser = { ...mockUser, latitude: null, longitude: null };
    const screen = openProfile();
    fireEvent.changeText(screen.getByDisplayValue('Boston'), 'Upton');
    await save(screen);
    expect(require('expo-location').geocodeAsync).toHaveBeenCalledWith('Upton, MA');
    expect(api.updateProfile).toHaveBeenCalledWith({ city: 'Upton', latitude: 42.36, longitude: -71.06 });
  });
  it('still uploads a changed profile photo after verification', async () => {
    mockUser.isVerified = true;
    require('expo-image-picker').launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] });
    const screen = openProfile();
    await act(async () => fireEvent.press(screen.getByText('Change Photo')));
    await save(screen);
    expect(api.uploadImage).toHaveBeenCalledWith('file:///photo.jpg', 'profiles');
    expect(api.updateProfile).toHaveBeenCalledWith({ profilePhotoUrl: 'https://test.s3.amazonaws.com/test.jpg' });
  });
  it('allows a verified member to clear a display name', async () => {
    mockUser.isVerified = true;
    const screen = openProfile();
    fireEvent.changeText(screen.getByDisplayValue('Tester'), '');
    await save(screen);
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: '' });
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
  it('closes an unchanged form without sending an empty update', async () => {
    await save(openProfile());
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
  it('keeps the edited display name and shows an error when saving fails', async () => {
    mockUser.isVerified = true;
    api.updateProfile.mockRejectedValueOnce(new Error('Could not save profile'));
    const screen = openProfile();
    fireEvent.changeText(screen.getByDisplayValue('Tester'), 'New public name');
    await save(screen);
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Could not save profile' }));
    expect(screen.getByDisplayValue('New public name')).toBeTruthy();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });
});
