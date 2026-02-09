import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getBundles.mockResolvedValue([]); api.getMyBundles.mockResolvedValue([]); api.getMyListings.mockResolvedValue([]); });
describe('BundlesScreen', () => {
  it('fetches bundles on mount', async () => { const S = require('../../src/screens/BundlesScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getBundles).toHaveBeenCalled(); }); });
  it('fetches my bundles', async () => { const S = require('../../src/screens/BundlesScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getMyBundles).toHaveBeenCalled(); }); });
  it('renders bundles title', async () => { const S = require('../../src/screens/BundlesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('No Bundles Available'); });
  it('shows empty state', async () => { const S = require('../../src/screens/BundlesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/Bundle items together/i); });
});
