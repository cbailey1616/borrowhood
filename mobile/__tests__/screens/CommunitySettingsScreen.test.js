import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import * as ImagePicker from 'expo-image-picker';
const mockShowError = jest.fn();
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCommunity.mockResolvedValue({ id: 'comm-1', name: 'Test Hood', description: 'A neighborhood' }); });
describe('CommunitySettingsScreen', () => {
  const coverRoute = { params: { id: 'comm-1', editCover: true } };
  const editableCommunity = { id: 'comm-1', name: 'Test Hood', description: 'A neighborhood', role: 'organizer', bannerUrl: 'https://example.com/old.jpg' };

  it('previews a moderator’s photo and saves the uploaded URL before returning to the neighborhood', async () => {
    api.getCommunity.mockResolvedValue(editableCommunity);
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///new.jpg' }] });
    api.uploadImages.mockResolvedValueOnce(['https://example.com/new.jpg']);
    api.updateCommunity.mockResolvedValueOnce({});
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.press(await screen.findByText('Change cover photo'));
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(api.updateCommunity).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(api.updateCommunity).toHaveBeenCalledWith('comm-1', {
      name: 'Test Hood', description: 'A neighborhood', bannerUrl: 'https://example.com/new.jpg',
    }));
    expect(api.uploadImages).toHaveBeenCalledWith(['file:///new.jpg'], 'communities');
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalledTimes(1));
  });

  it('does not save a removed cover when Cancel is pressed', async () => {
    api.getCommunity.mockResolvedValue(editableCommunity);
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.press(await screen.findByText('Remove cover photo'));
    fireEvent.press(screen.getByText('Cancel'));
    expect(api.updateCommunity).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the editor open without changing the saved cover when uploading fails', async () => {
    api.getCommunity.mockResolvedValue(editableCommunity);
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///new.jpg' }] });
    api.uploadImages.mockRejectedValueOnce(new Error('Upload failed'));
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.press(await screen.findByText('Change cover photo'));
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Upload failed' })));
    expect(api.updateCommunity).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('does not open the cover editor for a regular member even with the route parameter', async () => {
    api.getCommunity.mockResolvedValue({ ...editableCommunity, role: 'member' });
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    await screen.findByText('Test Hood');
    expect(screen.queryByText('Change cover photo')).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
  });

  const route = { params: { id: 'comm-1' } };
  it('fetches community details', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getCommunity).toHaveBeenCalledWith('comm-1'); });
  });
  it('displays community name', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Test Hood');
  });
  it('shows invite neighbors option', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Invite Neighbors');
  });
  it('shows leave neighborhood button', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Leave Neighborhood');
  });
  it('gives moderators a clear member management entry point', async () => {
    api.getCommunity.mockResolvedValue({ id: 'comm-1', name: 'Test Hood', role: 'organizer' });
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await findByText('Manage Members'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CommunityMembers', { id: 'comm-1', role: 'organizer' });
  });
  it('opens saved notification settings instead of showing unsaved switches', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await findByText('Notification settings'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('NotificationSettings');
  });
});
