import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getTransactions.mockResolvedValue([]); });
describe('ActivityScreen', () => {
  it('fetches transactions on mount', async () => { const S = require('../../src/screens/ActivityScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getTransactions).toHaveBeenCalled(); }); });
  it('shows empty state', async () => { const S = require('../../src/screens/ActivityScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/No activity/i); });
  it('renders All tab', async () => { const S = require('../../src/screens/ActivityScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('All'); });
  it('renders Borrowing tab', async () => { const S = require('../../src/screens/ActivityScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('Borrowing'); });
  it('renders Lending tab', async () => { const S = require('../../src/screens/ActivityScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('Lending'); });
});
