import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.addPaymentMethod.mockResolvedValue({ clientSecret: 'seti_test_secret' }); });
describe('AddPaymentMethodScreen', () => {
  it('calls api.addPaymentMethod on mount', async () => { const S = require('../../src/screens/AddPaymentMethodScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.addPaymentMethod).toHaveBeenCalled(); }); });
  it('renders Save Card button', async () => { const S = require('../../src/screens/AddPaymentMethodScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('Save Card'); });
  it('renders card input area', async () => { const S = require('../../src/screens/AddPaymentMethodScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('Add a Card'); });
});
