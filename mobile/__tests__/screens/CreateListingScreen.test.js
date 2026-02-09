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
  api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]);
  api.createListing.mockResolvedValue({ id: 'new-listing-1' });
  api.checkSubscriptionAccess.mockResolvedValue({ canAccess: true, nextStep: null });
  api.getCommunities.mockResolvedValue([]);
  api.getFriends.mockResolvedValue([]);
});

describe('CreateListingScreen', () => {
  const route = { params: {} };

  it('renders form with title and description inputs', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('CreateListing.input.title')).toBeTruthy();
    expect(getByTestId('CreateListing.input.description')).toBeTruthy();
  });

  it('title and description accept text', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByTestId('CreateListing.input.title'), 'My Power Drill');
    fireEvent.changeText(getByTestId('CreateListing.input.description'), 'DeWalt 20V cordless drill');
  });

  it('submit button exists', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByText } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByText('List Item')).toBeTruthy();
  });

  it('validates required fields on submit', async () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId, getByText } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    await act(async () => { fireEvent.press(getByText('List Item')); });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('add photo button exists', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('CreateListing.button.addPhoto')).toBeTruthy();
  });

  it('renders rental fee toggle', () => {
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByTestId } = render(<CreateListingScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('CreateListing.toggle.rentalFee')).toBeTruthy();
  });
});
