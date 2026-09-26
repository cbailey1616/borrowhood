import React from 'react';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import { readDraft, saveDraft, deleteDraft } from '../../src/utils/draftStorage';
import { useFocusEffect } from '@react-navigation/native';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: jest.fn() }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));
jest.mock('../../src/utils/draftStorage', () => ({ readDraft: jest.fn(), saveDraft: jest.fn(), deleteDraft: jest.fn().mockResolvedValue() }));

beforeEach(() => {
  jest.clearAllMocks();
  readDraft.mockResolvedValue(null);
  saveDraft.mockResolvedValue();
  deleteDraft.mockResolvedValue();
  mockUser.isVerified = true;
  delete mockUser.city;
  delete mockUser.state;
  api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]);
  api.createListing.mockResolvedValue({ id: 'new-listing-1' });
  api.checkSubscriptionAccess.mockResolvedValue({ canAccess: true, nextStep: null });
  api.getCommunities.mockResolvedValue([]);
  api.getFriends.mockResolvedValue([]);
});

describe('CreateListingScreen', () => {
  const route = { params: {} };
  it.each([false, true])('starts the next item without the previous photo (submitted=%s)', async submitted => {
    let storedDraft = null;
    readDraft.mockImplementation(async () => storedDraft);
    saveDraft.mockImplementation(async (_, value) => { storedDraft = value; });
    deleteDraft.mockImplementation(async () => { storedDraft = null; });
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///previous-item.jpg' }] });
    if (submitted) api.uploadImages.mockResolvedValueOnce(['https://example.com/previous-item.jpg']);
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const first = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(first.getByTestId('CreateListing.button.submit')).not.toBeDisabled());
    fireEvent.changeText(first.getByLabelText('Listing title'), 'First item');
    await act(async () => fireEvent.press(first.getByText('Gallery')));
    const photoUris = screen => screen.UNSAFE_queryAllByType(Image).map(image => image.props.source?.uri).filter(Boolean);
    expect(photoUris(first)).toContain('file:///previous-item.jpg');
    if (submitted) await act(async () => fireEvent.press(first.getByTestId('CreateListing.button.submit')));
    first.unmount();
    const second = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(second.getByTestId('CreateListing.button.submit')).not.toBeDisabled());
    expect(second.getByLabelText('Listing title').props.value).toBe('');
    expect(photoUris(second)).not.toContain('file:///previous-item.jpg');
    if (submitted) {
      expect(second.queryByText('Resume unfinished item')).toBeNull();
      expect(storedDraft).toBeNull();
      expect(api.createListing).toHaveBeenCalledTimes(1);
    } else {
      fireEvent.press(second.getByText('Resume unfinished item'));
      expect(photoUris(second)).toContain('file:///previous-item.jpg');
      expect(second.getByLabelText('Listing title').props.value).toBe('First item');
    }
  });

  it('keeps selected photos while returning from another screen in the same creation', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///current-item.jpg' }] });
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(screen.getByTestId('CreateListing.button.submit')).not.toBeDisabled());
    await act(async () => fireEvent.press(screen.getByText('Gallery')));
    await act(async () => useFocusEffect.mock.calls[0][0]());
    expect(screen.UNSAFE_getAllByType(Image).some(image => image.props.source?.uri === 'file:///current-item.jpg')).toBe(true);
  });

  it('uses the cropped camera image and keeps it when the next capture is cancelled', async () => {
    ImagePicker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cropped-camera.jpg' }] }).mockResolvedValueOnce({ canceled: true });
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await act(async () => fireEvent.press(screen.getByText('Camera')));
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true }));
    const photos = () => screen.UNSAFE_getAllByType(Image).filter(image => image.props.source?.uri === 'file:///cropped-camera.jpg');
    expect(photos()).toHaveLength(1);
    await act(async () => fireEvent.press(screen.getByText('Camera')));
    expect(photos()).toHaveLength(1);
  });
  it.each([true, false])('defaults a new listing to Town with isVerified=%s', async isVerified => {
    mockUser.isVerified = isVerified;
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(screen.getByLabelText('Town').props.accessibilityState.checked).toBe(true));
  });
  it('uses neighborhood when town is not available', async () => {
    api.getCommunities.mockResolvedValue([{ id: 'community-1' }]);
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(screen.getByLabelText('Neighborhood').props.accessibilityState.checked).toBe(true));
  });
  it.each([false, true])('posts to all available audiences unless unchecked (opt out=%s)', async optOut => {
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    api.getFriends.mockResolvedValue([{ id: 'friend-1' }]);
    api.getCommunities.mockResolvedValue([{ id: 'community-1' }]);
    ImagePicker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///ladder.jpg' }] });
    api.uploadImages.mockResolvedValueOnce(['https://example.com/ladder.jpg']);
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => ['Friends', 'Neighborhood', 'Town'].forEach(label =>
      expect(screen.getByLabelText(label).props.accessibilityState.checked).toBe(true)));
    if (optOut) {
      fireEvent.press(screen.getByLabelText('Friends'));
      // Returning to the form must not reset a person's audience choices.
      await act(async () => useFocusEffect.mock.calls[0][0]());
      expect(screen.getByLabelText('Friends').props.accessibilityState.checked).toBe(false);
    }
    fireEvent.changeText(screen.getByLabelText('Listing title'), 'A ladder');
    await act(async () => fireEvent.press(screen.getByText('Camera')));
    await act(async () => fireEvent.press(screen.getByTestId('CreateListing.button.submit')));
    expect(api.createListing).toHaveBeenCalledWith(expect.objectContaining({
      visibility: optOut ? ['neighborhood', 'town'] : ['close_friends', 'neighborhood', 'town'],
      communityId: 'community-1', sharingConfirmed: true,
    }));
  });
  it.each([['town'], ['private'], ['close_friends']])('preserves a restored %s draft with every audience available', async scope => {
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    api.getFriends.mockResolvedValue([{ id: 'friend-1' }]);
    api.getCommunities.mockResolvedValue([{ id: 'community-1' }]);
    readDraft.mockResolvedValueOnce({ title: 'Saved ladder', visibility: [scope] });
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByText('Resume unfinished item'));
    await screen.findByDisplayValue('Saved ladder');
    await waitFor(() => expect(api.getFriends).toHaveBeenCalled());
    for (const [value, label] of [['close_friends', 'Friends'], ['neighborhood', 'Neighborhood'], ['town', 'Town']]) {
      expect(screen.getByLabelText(label).props.accessibilityState.checked).toBe(value === scope);
    }
  });
  it.each(['requestMatch', 'relistFrom'])('keeps %s listings private when Town is available', async flow => {
    mockUser.city = 'Upton'; mockUser.state = 'MA';
    api.getFriends.mockResolvedValue([{ id: 'friend-1' }]);
    api.getCommunities.mockResolvedValue([{ id: 'community-1' }]);
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { [flow]: { id: 'source-1', title: 'Private ladder' } } }} />);
    await screen.findByDisplayValue('Private ladder');
    await waitFor(() => expect(api.getFriends).toHaveBeenCalled());
    if (flow === 'relistFrom') expect(screen.getByText('Only you can see this item.')).toBeTruthy();
    expect(screen.getByText(flow === 'requestMatch' ? 'Send private offer' : 'Save to my inventory')).toBeTruthy();
  });
  it('reveals offline pricing without payout setup', async () => {
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const { getByLabelText, queryByLabelText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(queryByLabelText('Price per day')).toBeNull();
    fireEvent(getByLabelText('Charge a fee'), 'valueChange', true);
    fireEvent.changeText(getByLabelText('Price per day'), '2');
    await waitFor(() => expect(getByLabelText('Price per day').props.value).toBe('2'));
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it('renders form with title and description inputs', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId, getByText } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('CreateListing.input.title')).toBeTruthy();
    expect(getByTestId('CreateListing.input.description')).toBeTruthy();
  });

  it('title and description accept text', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId, getByText } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByTestId('CreateListing.input.title'), 'My Power Drill');
    fireEvent.changeText(getByTestId('CreateListing.input.description'), 'DeWalt 20V cordless drill');
  });

  it('saves the initial description and a free giveaway', async () => {
    ImagePicker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///listing.jpg' }] });
    api.uploadImages.mockResolvedValueOnce(['https://example.com/listing.jpg']);
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(screen.getByTestId('CreateListing.button.submit')).not.toBeDisabled());
    fireEvent.changeText(screen.getByLabelText('Listing title'), 'Desk chair');
    fireEvent.changeText(screen.getByLabelText('Listing description'), 'Good condition, adjustable height.');
    await act(async () => fireEvent.press(screen.getByText('Camera')));
    fireEvent.press(screen.getByText('Giveaway'));
    expect(screen.queryByLabelText('Sale price')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('CreateListing.button.submit')));
    expect(api.createListing).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Good condition, adjustable height.', listingType: 'giveaway',
      directFee: null,
      depositAmount: 0,
    }));
  });
  it('creates a distinct sale with a one-time price and no return dates', async () => {
    ImagePicker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///listing.jpg' }] });
    api.uploadImages.mockResolvedValueOnce(['https://example.com/listing.jpg']);
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(screen.getByTestId('CreateListing.button.submit')).not.toBeDisabled());
    fireEvent.changeText(screen.getByLabelText('Listing title'), 'Desk chair');
    fireEvent.changeText(screen.getByLabelText('Listing description'), 'Good condition, adjustable height.');
    await act(async () => fireEvent.press(screen.getByText('Camera')));
    fireEvent.press(screen.getByLabelText('Sell'));
    fireEvent.changeText(screen.getByLabelText('Sale price'), '25');
    await act(async () => fireEvent.press(screen.getByTestId('CreateListing.button.submit')));
    expect(api.createListing).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Good condition, adjustable height.', listingType: 'sell',
      directFee: { amount: 25, unit: 'flat', currency: 'USD' },
      minDuration: undefined, maxDuration: undefined,
      depositAmount: 0,
    }));
  });

  it('defaults to sharing a new listing with friends when no wider audience is available', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByText } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByText('Save shared item')).toBeTruthy();
  });

  it('validates required fields on submit', async () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByText, getByTestId } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    await waitFor(() => expect(getByTestId('CreateListing.button.submit')).not.toBeDisabled());
    await act(async () => { fireEvent.press(getByText('Save shared item')); });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('add photo button exists', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('CreateListing.button.addPhoto')).toBeTruthy();
  });

  it('does not show rental fee or deposit controls during the free launch', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { queryByTestId } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(queryByTestId('CreateListing.toggle.rentalFee')).toBeNull();
    expect(queryByTestId('CreateListing.toggle.deposit')).toBeNull();
  });
});

it('retries a lost publication response with the original photo and submission ID', async () => {
  ImagePicker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///retry-ladder.jpg' }] });
  api.uploadImages.mockResolvedValueOnce(['https://example.com/stored-ladder.jpg']);
  api.createListing.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({id:'saved-listing'});
  const Screen = require('../../src/screens/CreateListingScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{params:{}}} />);
  await waitFor(() => expect(screen.getByTestId('CreateListing.button.submit')).not.toBeDisabled());
  fireEvent.changeText(screen.getByLabelText('Listing title'), 'Extension ladder');
  await act(async () => fireEvent.press(screen.getByText('Camera')));
  await act(async () => fireEvent.press(screen.getByTestId('CreateListing.button.submit')));
  expect(mockShowError).toHaveBeenCalled();
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  const attempt = api.createListing.mock.calls[0][0];
  expect(attempt.clientRequestId).toEqual(expect.any(String));
  await act(async () => fireEvent.press(screen.getByTestId('CreateListing.button.submit')));
  expect(api.uploadImages).toHaveBeenCalledTimes(1);
  expect(api.createListing.mock.calls[1][0]).toEqual(attempt);
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
});
