import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]); api.updateListing.mockResolvedValue({}); api.deleteListing.mockResolvedValue({}); });

describe('EditListingScreen', () => {
  const listing = { id: 'l-1', title: 'My Drill', description: 'DeWalt 20V', condition: 'good', isFree: true, pricePerDay: 0, depositAmount: 0, visibility: 'close_friends', category: { id: 'cat-1', name: 'Tools' }, photos: ['https://test.com/photo.jpg'], minDuration: 1, maxDuration: 14 };
  const route = { params: { listing } };

  it('pre-populates form from route.params.listing', () => {
    const EditListingScreen = require('../../src/screens/EditListingScreen').default;
    const { getByDisplayValue } = render(<EditListingScreen navigation={mockNavigation} route={route} />);
    expect(getByDisplayValue('My Drill')).toBeTruthy();
    expect(getByDisplayValue('DeWalt 20V')).toBeTruthy();
  });

  it('save calls api.updateListing', async () => {
    const EditListingScreen = require('../../src/screens/EditListingScreen').default;
    const { getByText } = render(<EditListingScreen navigation={mockNavigation} route={route} />);
    await act(async () => { fireEvent.press(getByText(/Save/i)); });
    expect(api.updateListing).toHaveBeenCalled();
  });

  it('validates required fields', async () => {
    const route2 = { params: { listing: { ...listing, title: '' } } };
    const EditListingScreen = require('../../src/screens/EditListingScreen').default;
    const { getByText, getByDisplayValue } = render(<EditListingScreen navigation={mockNavigation} route={route2} />);
    await act(async () => { fireEvent.press(getByText(/Save/i)); });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('title is editable', () => {
    const EditListingScreen = require('../../src/screens/EditListingScreen').default;
    const { getByDisplayValue } = render(<EditListingScreen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByDisplayValue('My Drill'), 'Updated Drill');
  });
});
