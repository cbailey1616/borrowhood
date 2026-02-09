import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'free', isVerified: false, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, replace: jest.fn() };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: jest.fn() }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCurrentSubscription.mockResolvedValue(null); api.createSubscription.mockResolvedValue({ clientSecret: 'cs_test', ephemeralKey: 'ek_test', customerId: 'cus_test' }); });
describe('SubscriptionScreen', () => {
  const route = { params: { source: 'generic' } };
  it('fetches subscription on mount', async () => { const S = require('../../src/screens/SubscriptionScreen').default; render(<S navigation={mockNavigation} route={route} />); await waitFor(() => { expect(api.getCurrentSubscription).toHaveBeenCalled(); }); });
  it('free user sees subscribe button', async () => { const S = require('../../src/screens/SubscriptionScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Subscription.button.subscribe'); });
  it('displays price', async () => { const S = require('../../src/screens/SubscriptionScreen').default; const { getAllByText } = render(<S navigation={mockNavigation} route={route} />); await waitFor(() => { expect(getAllByText(/\$1/).length).toBeGreaterThan(0); }); });
  it('plus user sees plan info', async () => {
    api.getCurrentSubscription.mockResolvedValue({ tier: 'plus', status: 'active', cancelAtPeriodEnd: false, nextBillingDate: new Date().toISOString(), startedAt: new Date().toISOString() });
    const S = require('../../src/screens/SubscriptionScreen').default;
    const { getAllByText } = render(<S navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(getAllByText(/Plus/i).length).toBeGreaterThan(0); });
  });
  it('shows features list', async () => { const S = require('../../src/screens/SubscriptionScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText(/Borrow from anyone/i); });
});
