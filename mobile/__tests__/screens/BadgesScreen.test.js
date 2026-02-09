import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getMyBadges.mockResolvedValue([]); api.getAllBadges.mockResolvedValue([]); api.getLeaderboard.mockResolvedValue([]); });
describe('BadgesScreen', () => {
  it('fetches badges on mount', async () => { const S = require('../../src/screens/BadgesScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getAllBadges).toHaveBeenCalled(); }); });
  it('fetches my badges', async () => { const S = require('../../src/screens/BadgesScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getMyBadges).toHaveBeenCalled(); }); });
  it('renders badges title', async () => { const S = require('../../src/screens/BadgesScreen').default; const { getAllByText } = render(<S navigation={mockNavigation} />); await waitFor(() => { expect(getAllByText(/Badges/i).length).toBeGreaterThan(0); }); });
});
