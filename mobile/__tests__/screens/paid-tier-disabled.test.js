/**
 * Smoke tests to verify no subscription prompts appear when ENABLE_PAID_TIERS = false.
 * These tests ensure the free-only model works correctly.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import { ENABLE_PAID_TIERS } from '../../src/utils/config';
import { checkPremiumGate } from '../../src/utils/premiumGate';

// ============================================
// Shared mocks
// ============================================
const freeUser = {
  id: 'user-1',
  firstName: 'Free',
  lastName: 'User',
  email: 'free@test.com',
  subscriptionTier: 'free',
  isVerified: false,
  hasConnectAccount: false,
  profilePhotoUrl: null,
  onboardingCompleted: true,
  rating: 4.0,
  ratingCount: 3,
  totalTransactions: 2,
  isFounder: false,
  referralCode: 'BH-FREE',
  city: 'Portland',
};

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(),
  canGoBack: () => true,
  push: jest.fn(),
  replace: jest.fn(),
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: freeUser,
    isLoading: false,
    isAuthenticated: true,
    logout: jest.fn(),
    refreshUser: jest.fn().mockResolvedValue(freeUser),
  }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.getFeed.mockResolvedValue({ items: [], hasMore: false });
  api.getCategories.mockResolvedValue([]);
  api.updateOnboardingStep.mockResolvedValue({});
});

// ============================================
// Feature flag sanity check
// ============================================
describe('Feature flag', () => {
  it('ENABLE_PAID_TIERS is false', () => {
    expect(ENABLE_PAID_TIERS).toBe(false);
  });
});

// ============================================
// premiumGate bypassed for free users
// ============================================
describe('premiumGate with paid tiers disabled', () => {
  it('town_browse requires verification for unverified user', () => {
    const result = checkPremiumGate(freeUser, 'town_browse');
    // Unverified users must verify even without paid tiers
    expect(result.passed).toBe(false);
    expect(result.screen).toBe('IdentityVerification');
  });

  it('town_browse passes for verified free user', () => {
    const verifiedUser = { ...freeUser, isVerified: true };
    const result = checkPremiumGate(verifiedUser, 'town_browse');
    expect(result.passed).toBe(true);
  });

  it('rental_listing requires verification first, then Stripe Connect', () => {
    const result = checkPremiumGate(freeUser, 'rental_listing');
    // Unverified user goes to IdentityVerification first
    expect(result.passed).toBe(false);
    expect(result.screen).toBe('IdentityVerification');
  });

  it('rental_listing passes when user is verified and has Connect', () => {
    const userWithConnect = { ...freeUser, isVerified: true, hasConnectAccount: true };
    const result = checkPremiumGate(userWithConnect, 'rental_listing');
    expect(result.passed).toBe(true);
  });
});

// ============================================
// ProfileScreen: no subscription menu item
// ============================================
describe('ProfileScreen — no subscription prompt', () => {
  it('does not show Subscription menu item', () => {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    const { queryByTestId, queryByText } = render(
      <ProfileScreen navigation={mockNavigation} />
    );
    expect(queryByTestId('Profile.menu.subscription')).toBeNull();
    expect(queryByText('Subscription')).toBeNull();
  });
});

// ============================================
// FeedScreen: no upgrade overlay
// ============================================
describe('FeedScreen — no upgrade prompt', () => {
  it('does not render upgrade overlay', async () => {
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { queryByTestId } = render(
      <FeedScreen navigation={mockNavigation} />
    );
    await waitFor(() => {
      expect(queryByTestId('Feed.overlay.upgrade')).toBeNull();
    });
  });

  it('does not render upgrade button', async () => {
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { queryByTestId } = render(
      <FeedScreen navigation={mockNavigation} />
    );
    await waitFor(() => {
      expect(queryByTestId('Feed.overlay.upgrade.button')).toBeNull();
    });
  });
});

// ============================================
// CreateListingScreen: town visibility allowed for free users
// ============================================
describe('CreateListingScreen — no subscription gate on town', () => {
  it('allows selecting town visibility without subscription prompt', async () => {
    api.getCategories.mockResolvedValue([]);
    const CreateListingScreen = require('../../src/screens/CreateListingScreen').default;
    const { getByText } = render(
      <CreateListingScreen navigation={mockNavigation} route={{ params: {} }} />
    );
    await waitFor(() => {
      expect(getByText('My Town')).toBeTruthy();
    });
    // Pressing town should NOT trigger navigation to Subscription screen
    fireEvent.press(getByText('My Town'));
    expect(mockNavigation.push).not.toHaveBeenCalledWith(
      'Subscription',
      expect.anything()
    );
  });
});
