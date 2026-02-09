import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getLibraryItems = jest.fn().mockResolvedValue([]); });
describe('CommunityLibraryScreen', () => {
  it('fetches library items on mount', async () => {
    const Screen = require('../../src/screens/CommunityLibraryScreen').default;
    render(<Screen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getLibraryItems).toHaveBeenCalled(); });
  });
  it('shows empty state', async () => {
    const Screen = require('../../src/screens/CommunityLibraryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Library is Empty');
  });
  it('displays library items', async () => {
    api.getLibraryItems.mockResolvedValue([{ id: 'item-1', title: 'Board Game', condition: 'good', isAvailable: true, checkoutLimitDays: 14, donatedBy: 'Alice', photoUrl: 'https://test.com/photo.jpg' }]);
    const Screen = require('../../src/screens/CommunityLibraryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Board Game');
  });
  it('shows available status badge', async () => {
    api.getLibraryItems.mockResolvedValue([{ id: 'item-1', title: 'Board Game', condition: 'good', isAvailable: true, checkoutLimitDays: 14, donatedBy: 'Alice', photoUrl: 'https://test.com/photo.jpg' }]);
    const Screen = require('../../src/screens/CommunityLibraryScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Available');
  });
});
