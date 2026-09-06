import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null,
  onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5,
};

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(), canGoBack: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyListings.mockResolvedValue([]);
  api.getMyRequests.mockResolvedValue([]);
});

describe('MyItemsScreen', () => {
  it('renders SegmentedControl', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const { findByTestId } = render(<MyItemsScreen navigation={mockNavigation} />);
    const segment = await findByTestId('MyItems.segment');
    expect(segment).toBeTruthy();
  });

  // My Items opens the owner's inventory, with exchanges and requests secondary.
  const selectTab = async (utils, index) => {
    const segment = await utils.findByTestId(`MyItems.segment.${index}`);
    await act(async () => {
      fireEvent.press(segment);
    });
  };

  it('opens own inventory without requiring a tab switch', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    expect(utils.getByTestId('MyItems.segment.0').props.accessibilityState.selected).toBe(true);
    await waitFor(() => {
      expect(api.getMyListings).toHaveBeenCalled();
    });
  });

  it('displays listing cards with title', async () => {
    api.getMyListings.mockResolvedValue([{
      id: 'listing-1', title: 'My Drill', condition: 'good', isFree: true,
      pricePerDay: 0, photos: ['https://test.com/photo.jpg'], isAvailable: true,
      timesBorrowed: 2, pendingRequests: 0,
    }]);
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    await selectTab(utils, 0);
    await utils.findByText('My Drill');
  });

  it('empty items state renders', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    await selectTab(utils, 0);
    await utils.findByText('Your listings start here');
  });

  it('requests tab calls api.getMyRequests', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    // Switch to ISO tab (index 2)
    await selectTab(utils, 1);
    await waitFor(() => {
      expect(api.getMyRequests).toHaveBeenCalled();
    });
  });

  it('displays request cards', async () => {
    api.getMyRequests.mockResolvedValue([{
      id: 'req-1', title: 'Need a ladder', description: 'For painting',
      category: { name: 'Tools' }, status: 'open', createdAt: new Date().toISOString(),
    }]);
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    await selectTab(utils, 1);
    await utils.findByText('Need a ladder');
  });
});
