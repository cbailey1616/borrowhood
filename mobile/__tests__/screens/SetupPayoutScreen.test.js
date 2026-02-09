import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, popToTop: jest.fn() };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' }, refreshUser: jest.fn() }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getConnectStatus.mockResolvedValue(null); api.getConnectOnboardingLink.mockResolvedValue({ url: 'https://connect.stripe.com/test' }); });
describe('SetupPayoutScreen', () => {
  const route = { params: { source: 'generic' } };
  it('fetches connect status', async () => { const S = require('../../src/screens/SetupPayoutScreen').default; render(<S navigation={mockNavigation} route={route} />); await waitFor(() => { expect(api.getConnectStatus).toHaveBeenCalled(); }); });
  it('shows setup button when not connected', async () => { const S = require('../../src/screens/SetupPayoutScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('SetupPayout.button.setup'); });
  it('shows status when complete', async () => { api.getConnectStatus.mockResolvedValue({ chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, hasAccount: true }); const S = require('../../src/screens/SetupPayoutScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('SetupPayout.status.complete'); });
  it('renders title', async () => { const S = require('../../src/screens/SetupPayoutScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText(/Payout/i); });
});
