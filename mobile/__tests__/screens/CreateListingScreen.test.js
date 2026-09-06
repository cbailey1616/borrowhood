import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: jest.fn() }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
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
  it('defaults a new verified-town listing to town', async () => {
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
    const { getByLabelText, findByText, queryByLabelText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(queryByLabelText('Price per day')).toBeNull();
    fireEvent(getByLabelText('Charge a fee'), 'valueChange', true);
    fireEvent.changeText(getByLabelText('Price per day'), '2.50');
    await findByText(/Borrowhood does not collect or process/);
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it('renders form with title and description inputs', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId, getByText } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('CreateListing.input.title')).toBeTruthy();
    fireEvent.press(getByText('Add optional details'));
    expect(getByTestId('CreateListing.input.description')).toBeTruthy();
  });

  it('title and description accept text', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId, getByText } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByTestId('CreateListing.input.title'), 'My Power Drill');
    fireEvent.press(getByText('Add optional details'));
    fireEvent.changeText(getByTestId('CreateListing.input.description'), 'DeWalt 20V cordless drill');
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
