import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
const mockShowError = jest.fn();
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
jest.mock('../../src/components/CoverPhotoCropper', () => {
  const { View, Button } = require('react-native');
  return ({ onCancel, onComplete }) => <View>
    <Button title="Use cropped cover" onPress={() => onComplete('file:///cropped-cover.jpg')} />
    <Button title="Cancel cover crop" onPress={onCancel} />
  </View>;
});
beforeEach(() => { jest.clearAllMocks(); api.getCommunity.mockResolvedValue({ id: 'comm-1', name: 'Test Hood', description: 'A neighborhood' }); });
describe('CommunitySettingsScreen', () => {
  const coverRoute = { params: { id: 'comm-1', editCover: true } };
  const editableCommunity = { id: 'comm-1', name: 'Test Hood', description: 'A neighborhood', role: 'organizer', bannerUrl: 'https://example.com/old.jpg' };

  it.each([[null, 'Cleanup on Saturday'], ['Cleanup on Saturday', '']])('saves a posted or cleared announcement (%s)', async (before, after) => {
    api.getCommunity.mockResolvedValue({ ...editableCommunity, announcement: before });
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.changeText(await screen.findByLabelText('Neighborhood announcement'), after);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(api.updateCommunity).toHaveBeenCalledWith('comm-1', expect.objectContaining({ announcement: after })));
  });

  it('previews a moderator’s photo and saves the uploaded URL before returning to the neighborhood', async () => {
    api.getCommunity.mockResolvedValue(editableCommunity);
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///new.jpg' }] });
    api.uploadImages.mockResolvedValueOnce(['https://example.com/new.jpg']);
    api.updateCommunity.mockResolvedValueOnce({});
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.press(await screen.findByText('Change cover photo'));
    fireEvent.press(await screen.findByText('Choose photo'));
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(api.updateCommunity).not.toHaveBeenCalled();
    fireEvent.press(await screen.findByText('Use cropped cover'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(api.updateCommunity).toHaveBeenCalledWith('comm-1', {
      name: 'Test Hood', description: 'A neighborhood', bannerUrl: 'https://example.com/new.jpg',
    }));
    expect(api.uploadImages).toHaveBeenCalledWith(['file:///cropped-cover.jpg'], 'communities');
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
    fireEvent.press(await screen.findByText('Choose photo'));
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    fireEvent.press(await screen.findByText('Use cropped cover'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Upload failed' })));
    expect(api.updateCommunity).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('takes a photo, crops it, and shows the fresh saved cover when editing again', async () => {
    api.getCommunity.mockResolvedValue({ ...editableCommunity, bannerUrl: null });
    ImagePicker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///camera.jpg' }] });
    api.uploadImages.mockResolvedValueOnce(['https://storage.example/cover.jpg']);
    api.updateCommunity.mockResolvedValueOnce({ bannerUrl: 'https://api.example/private-photos/fresh' });
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'comm-1' } }} />);
    fireEvent.press(await screen.findByText('Edit Details'));
    fireEvent.press(screen.getByText('Add cover photo'));
    fireEvent.press(await screen.findByText('Take photo'));
    fireEvent.press(await screen.findByText('Use cropped cover'));
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsEditing: false }));
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Save'));
    fireEvent.press(await screen.findByText('Edit Details'));
    expect(screen.getByLabelText('Cover photo preview').props.source.uri).toBe('https://api.example/private-photos/fresh');
    expect(api.uploadImages).toHaveBeenCalledWith(['file:///cropped-cover.jpg'], 'communities');
  });

  it.each(['camera', 'crop'])('keeps the saved cover when cancelling the %s', async stage => {
    api.getCommunity.mockResolvedValue(editableCommunity);
    ImagePicker.launchCameraAsync.mockResolvedValueOnce(stage === 'camera' ? { canceled: true } : { canceled: false, assets: [{ uri: 'file:///new.jpg' }] });
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.press(await screen.findByText('Change cover photo'));
    fireEvent.press(await screen.findByText('Take photo'));
    await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalled());
    if (stage === 'crop') fireEvent.press(await screen.findByText('Cancel cover crop'));
    expect(screen.getByLabelText('Cover photo preview').props.source.uri).toBe(editableCommunity.bannerUrl);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(api.updateCommunity).toHaveBeenCalledWith('comm-1', { name: 'Test Hood', description: 'A neighborhood' }));
    expect(api.uploadImages).not.toHaveBeenCalled();
  });

  it('offers Settings when camera permission is denied, without replacing the cover', async () => {
    api.getCommunity.mockResolvedValue(editableCommunity);
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'denied', canAskAgain: false });
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.press(await screen.findByText('Change cover photo'));
    fireEvent.press(await screen.findByText('Take photo'));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ primaryAction: 'Open Settings' })));
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Cover photo preview').props.source.uri).toBe(editableCommunity.bannerUrl);
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await mockShowError.mock.calls[0][0].onPrimaryPress();
    expect(settings).toHaveBeenCalled();
    settings.mockRestore();
  });

  it('omits an unchanged temporary cover URL when saving other details', async () => {
    api.getCommunity.mockResolvedValue({ ...editableCommunity, bannerUrl: 'https://api.example/api/private-photos/expired' });
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={coverRoute} />);
    fireEvent.changeText(await screen.findByPlaceholderText('Neighborhood name'), 'New name');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(api.updateCommunity).toHaveBeenCalledWith('comm-1', { name: 'New name', description: 'A neighborhood' }));
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
