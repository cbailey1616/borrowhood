import React from 'react';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: jest.fn() }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
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
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Visible to Town');
  });
  it('uses neighborhood when town is not available', async () => {
    api.getCommunities.mockResolvedValue([{ id: 'community-1' }]);
    const Screen = require('../../src/screens/CreateListingScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Visible to Neighborhood');
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
