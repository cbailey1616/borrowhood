import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getPaymentMethods.mockResolvedValue([]); api.getConnectStatus.mockResolvedValue(null); api.removePaymentMethod.mockResolvedValue({}); api.setDefaultPaymentMethod.mockResolvedValue({}); });
describe('PaymentMethodsScreen', () => {
  const route = { params: {} };
  it('fetches payment methods', async () => { const S = require('../../src/screens/PaymentMethodsScreen').default; render(<S navigation={mockNavigation} route={route} />); await waitFor(() => { expect(api.getPaymentMethods).toHaveBeenCalled(); }); });
  it('shows empty state', async () => { const S = require('../../src/screens/PaymentMethodsScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText('No payment methods added'); });
  it('displays card list', async () => { api.getPaymentMethods.mockResolvedValue([{ id: 'pm-1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027, isDefault: true }]); const S = require('../../src/screens/PaymentMethodsScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText(/4242/); });
  it('shows default badge', async () => { api.getPaymentMethods.mockResolvedValue([{ id: 'pm-1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027, isDefault: true }]); const S = require('../../src/screens/PaymentMethodsScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText(/Default/i); });
  it('shows add button', async () => { const S = require('../../src/screens/PaymentMethodsScreen').default; const { getAllByText } = render(<S navigation={mockNavigation} route={route} />); await waitFor(() => { expect(getAllByText(/Add/i).length).toBeGreaterThan(0); }); });
});
