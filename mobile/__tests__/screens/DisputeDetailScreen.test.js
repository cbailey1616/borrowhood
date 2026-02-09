import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
const mockDispute = {
  id: 'd-1',
  status: 'open',
  reason: 'Item damaged',
  listing: { id: 'listing-1', title: 'Camera', photos: ['https://test.com/photo.jpg'] },
  lender: { id: 'user-1', firstName: 'Test', lastName: 'User', profilePhotoUrl: null },
  borrower: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null },
  transaction: { id: 'txn-1', rentalFee: 25.00, depositAmount: 50.00, conditionAtPickup: 'good', conditionAtReturn: 'damaged' },
  evidenceUrls: [],
  isOrganizer: false,
  createdAt: new Date().toISOString(),
};
beforeEach(() => { jest.clearAllMocks(); api.getDispute.mockResolvedValue(mockDispute); });
describe('DisputeDetailScreen', () => {
  const route = { params: { id: 'd-1' } };
  it('fetches dispute', async () => { const S = require('../../src/screens/DisputeDetailScreen').default; render(<S navigation={mockNavigation} route={route} />); await waitFor(() => { expect(api.getDispute).toHaveBeenCalledWith('d-1'); }); });
  it('displays reason', async () => { const S = require('../../src/screens/DisputeDetailScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText('Item damaged'); });
  it('displays parties', async () => { const S = require('../../src/screens/DisputeDetailScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText('Alice'); });
  it('shows status', async () => { const S = require('../../src/screens/DisputeDetailScreen').default; const { findByText } = render(<S navigation={mockNavigation} route={route} />); await findByText('Open'); });
});
