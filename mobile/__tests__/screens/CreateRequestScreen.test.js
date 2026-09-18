import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import { readDraft, saveDraft } from '../../src/utils/draftStorage';
import { useFocusEffect } from '@react-navigation/native';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
jest.mock('../../src/utils/draftStorage', () => ({ readDraft: jest.fn(), saveDraft: jest.fn(), deleteDraft: jest.fn().mockResolvedValue() }));

beforeEach(() => { readDraft.mockResolvedValue(null); saveDraft.mockResolvedValue(); });

beforeEach(() => { jest.clearAllMocks(); mockUser.isVerified = true; delete mockUser.city; delete mockUser.state; api.getFriends.mockResolvedValue([{ id: 'friend-1' }]); api.getCommunities.mockResolvedValue([]); api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]); api.createRequest.mockResolvedValue({ id: 'req-1' }); });

describe('CreateRequestScreen', () => {
  it.each([false, true])('includes all available audiences and preserves manual choices on refocus (opt out=%s)', async optOut => {
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    api.getCommunities.mockResolvedValue([{ id: 'community-1' }]);
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Visible to Friends and Neighborhood and Town');
    if (optOut) {
      fireEvent.press(screen.getByLabelText('Change who can see this post'));
      fireEvent.press(screen.getByLabelText('Friends'));
      mockUser.city = 'West Upton';
      screen.rerender(<Screen navigation={mockNavigation} />);
      await act(async () => { useFocusEffect.mock.calls[0][0](); useFocusEffect.mock.calls[1][0](); });
      expect(screen.getByLabelText('Friends').props.accessibilityState.checked).toBe(false);
    }
    fireEvent.changeText(screen.getByPlaceholderText(/Power drill/), 'Weekend ladder');
    await act(async () => fireEvent.press(screen.getByTestId('CreateRequest.button.submit')));
    expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      visibility: optOut ? ['neighborhood', 'town'] : ['close_friends', 'neighborhood', 'town'],
      communityId: 'community-1',
    }));
  });

  it('waits for friends before choosing the default audience', async () => {
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    let finishFriends;
    api.getFriends.mockReturnValueOnce(new Promise(resolve => { finishFriends = resolve; }));
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByPlaceholderText(/Power drill/);
    expect(screen.getByTestId('CreateRequest.button.submit')).toBeDisabled();
    await act(async () => finishFriends([{ id: 'friend-1' }]));
    expect(screen.getByText('Visible to Friends and Town')).toBeTruthy();
  });

  it.each([['town'], ['close_friends']])('does not expand a restored %s request draft', async scope => {
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    api.getCommunities.mockResolvedValue([{ id: 'community-1' }]);
    readDraft.mockResolvedValueOnce({ title: 'Saved request', visibility: [scope] });
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByDisplayValue('Saved request');
    await waitFor(() => expect(screen.getByTestId('CreateRequest.button.submit')).not.toBeDisabled());
    await act(async () => fireEvent.press(screen.getByTestId('CreateRequest.button.submit')));
    expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({ visibility: [scope] }));
  });
  it('lets an unverified member with no friends post a Town request', async () => {
    mockUser.isVerified = false;
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    api.getFriends.mockResolvedValue([]);
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Visible to Town');
    fireEvent.changeText(screen.getByPlaceholderText(/Power drill/), 'A ladder for the weekend');
    await waitFor(() => expect(screen.getByTestId('CreateRequest.button.submit')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('CreateRequest.button.submit'));
    await waitFor(() => expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      title: 'A ladder for the weekend', visibility: ['town'], townPreviewEnabled: true,
    })));
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('renders title input', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByPlaceholderText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await findByPlaceholderText(/Power drill/);
  });

  it('renders description input', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByPlaceholderText, findByText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    fireEvent.press(await findByText('Add details'));
    await findByPlaceholderText(/Add more details/);
  });

  it('post request validates required fields', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { getByPlaceholderText, getByText, getByTestId } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await waitFor(() => { expect(getByPlaceholderText(/Power drill/)).toBeTruthy(); });
    // Title is the required field (Category is optional). Submit with an empty
    // title and validation should fire.
    await waitFor(() => expect(getByTestId('CreateRequest.button.submit')).not.toBeDisabled());
    await act(async () => { fireEvent.press(getByText('Post in Wanted')); });
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ type: 'validation' }));
  });

  it('renders Post in Wanted button', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await findByText('Post in Wanted');
  });

  it('blocks a request nobody can see and offers an explicit next step', async () => {
    mockUser.isVerified = false;
    api.getFriends.mockResolvedValue([]);
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const { findByText, getByTestId, getByPlaceholderText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Choose who can see your post');
    fireEvent.changeText(getByPlaceholderText(/Power drill/), 'A drill');
    expect(getByTestId('CreateRequest.button.submit')).toBeDisabled();
    expect(api.createRequest).not.toHaveBeenCalled();
    expect(await findByText('Choose who can see your post')).toBeTruthy();
  });

  it('shows date presets without requiring typed date strings or optional details', async () => {
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const { findByText, getByLabelText, queryByPlaceholderText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Today');
    fireEvent.press(await findByText('Choose dates'));
    expect(getByLabelText('Choose needed from date')).toBeTruthy();
    expect(queryByPlaceholderText('YYYY-MM-DD')).toBeNull();
    expect(queryByPlaceholderText(/Add more details/)).toBeNull();
  });
});


describe('item request photos', () => {
  it.each([false, true])('uploads before posting and preserves the form on failure (%s)', async fail => {
    const picker = require('expo-image-picker');
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///requested-drill.jpg' }] });
    if (fail) api.uploadImages.mockRejectedValueOnce(new Error('Photo upload failed'));
    else api.uploadImages.mockResolvedValueOnce(['https://test.example/request.jpg']);
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => expect(screen.getByTestId('CreateRequest.button.submit')).not.toBeDisabled());
    fireEvent.changeText(screen.getByPlaceholderText(/Power drill/), 'A specific drill');
    fireEvent.press(screen.getByLabelText('Add request photo'));
    fireEvent.press(await screen.findByTestId('RequestPhoto.library'));
    await screen.findByLabelText('Remove request photo');
    fireEvent.press(screen.getByTestId('CreateRequest.button.submit'));
    await waitFor(() => expect(api.uploadImages).toHaveBeenCalledWith(['file:///requested-drill.jpg'], 'listings'));
    if (fail) {
      await waitFor(() => expect(mockShowError).toHaveBeenCalled());
      expect(api.createRequest).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue('A specific drill')).toBeTruthy();
      expect(screen.getByLabelText('Remove request photo')).toBeTruthy();
    } else await waitFor(() => expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: 'https://test.example/request.jpg' })));
  });
});

it('retries a wanted post with its original submission ID after a lost response', async () => {
  api.createRequest.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({id:'saved-request'});
  const Screen = require('../../src/screens/CreateRequestScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  fireEvent.changeText(await screen.findByPlaceholderText(/Power drill/), 'Weekend ladder');
  await waitFor(() => expect(screen.getByTestId('CreateRequest.button.submit')).not.toBeDisabled());
  await act(async () => fireEvent.press(screen.getByTestId('CreateRequest.button.submit')));
  expect(mockShowError).toHaveBeenCalled();
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  const attempt = api.createRequest.mock.calls[0][0];
  expect(attempt.clientRequestId).toEqual(expect.any(String));
  await act(async () => fireEvent.press(screen.getByTestId('CreateRequest.button.submit')));
  expect(api.createRequest.mock.calls[1][0]).toEqual(attempt);
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
});
