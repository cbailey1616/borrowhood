import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); });
describe('NotificationSettingsScreen', () => {
  it('fetches preferences on mount', async () => { const S = require('../../src/screens/NotificationSettingsScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getNotificationPreferences).toHaveBeenCalled(); }); });
  it('renders notification categories', async () => { const S = require('../../src/screens/NotificationSettingsScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/Borrowing/i); });
  it('renders toggle switches', async () => { const S = require('../../src/screens/NotificationSettingsScreen').default; const { getAllByText } = render(<S navigation={mockNavigation} />); await waitFor(() => { expect(getAllByText(/Borrow Request/i).length).toBeGreaterThan(0); }); });
  it('renders community section', async () => { const S = require('../../src/screens/NotificationSettingsScreen').default; const { getAllByText } = render(<S navigation={mockNavigation} />); await waitFor(() => { expect(getAllByText(/Community/i).length).toBeGreaterThan(0); }); });
});
