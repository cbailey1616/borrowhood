import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCircles.mockResolvedValue([]); api.createCircle.mockResolvedValue({ id: 'circle-1' }); api.joinCircle.mockResolvedValue({}); api.leaveCircle.mockResolvedValue({}); });
describe('LendingCirclesScreen', () => {
  it('fetches circles on mount', async () => { const S = require('../../src/screens/LendingCirclesScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getCircles).toHaveBeenCalled(); }); });
  it('shows empty state', async () => { const S = require('../../src/screens/LendingCirclesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/No Circles/i); });
  it('renders title', async () => { const S = require('../../src/screens/LendingCirclesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/Lending Circles/i); });
  it('displays circles', async () => { api.getCircles.mockResolvedValue([{ id: 'c-1', name: 'Book Club', description: 'Share books', memberCount: 5, isMember: true, isInvited: false }]); const S = require('../../src/screens/LendingCirclesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('Book Club'); });
  it('shows leave button for member circles', async () => { api.getCircles.mockResolvedValue([{ id: 'c-1', name: 'Book Club', description: 'Share books', memberCount: 5, isMember: true, isInvited: false }]); const S = require('../../src/screens/LendingCirclesScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/Leave/i); });
});
