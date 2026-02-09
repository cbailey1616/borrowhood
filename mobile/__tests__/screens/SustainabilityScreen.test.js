import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getSustainabilityStats.mockResolvedValue({ totalBorrows: 5, totalLends: 3, moneySavedCents: 5000, co2SavedKg: 2.5, wastePreventedKg: 1.2 }); api.getCommunitySustainability.mockResolvedValue({ name: 'Test Community', memberCount: 50, totalTransactions: 100, totalSavedCents: 20000, totalCo2SavedKg: 50 }); });
describe('SustainabilityScreen', () => {
  it('fetches stats on mount', async () => { const S = require('../../src/screens/SustainabilityScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getSustainabilityStats).toHaveBeenCalled(); }); });
  it('fetches community stats', async () => { const S = require('../../src/screens/SustainabilityScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getCommunitySustainability).toHaveBeenCalled(); }); });
  it('renders impact title', async () => { const S = require('../../src/screens/SustainabilityScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('Your Impact'); });
});
