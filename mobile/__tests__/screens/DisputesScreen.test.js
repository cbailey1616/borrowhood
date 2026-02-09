import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getDisputes.mockResolvedValue([]); });
describe('DisputesScreen', () => {
  it('fetches disputes', async () => { const S = require('../../src/screens/DisputesScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getDisputes).toHaveBeenCalled(); }); });
  it('shows empty state', async () => { const S = require('../../src/screens/DisputesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/no dispute/i); });
  it('displays dispute list', async () => { api.getDisputes.mockResolvedValue([{ id: 'd-1', status: 'open', reason: 'Item damaged', transaction: { listing: { title: 'Camera' } }, createdAt: new Date().toISOString() }]); const S = require('../../src/screens/DisputesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/Item damaged|Camera/); });
  it('tap navigates to DisputeDetail', async () => { api.getDisputes.mockResolvedValue([{ id: 'd-1', status: 'open', reason: 'Item damaged', transaction: { listing: { title: 'Camera' } }, createdAt: new Date().toISOString() }]); const S = require('../../src/screens/DisputesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); const item = await findByText(/Item damaged|Camera/); fireEvent.press(item); expect(mockNavigation.navigate).toHaveBeenCalledWith('DisputeDetail', expect.anything()); });
});
