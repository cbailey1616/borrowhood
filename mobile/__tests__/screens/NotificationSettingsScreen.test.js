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
  it('renders toggle switches', async () => { const S = require('../../src/screens/NotificationSettingsScreen').default; const { getAllByText } = render(<S navigation={mockNavigation} />); await waitFor(() => { expect(getAllByText(/Borrowing & lending/i).length).toBeGreaterThan(0); }); });
  it('renders community section', async () => { const S = require('../../src/screens/NotificationSettingsScreen').default; const { getAllByText } = render(<S navigation={mockNavigation} />); await waitFor(() => { expect(getAllByText(/Your neighborhood/i).length).toBeGreaterThan(0); }); });
});

  it('does not show retired payment or broadcast controls and saves message changes', async () => {
    const S = require('../../src/screens/NotificationSettingsScreen').default;
    const view = render(<S />);
    await view.findByText('Messages');
    expect(view.queryByText('Payment Updates')).toBeNull();
    expect(view.queryByText('Request Posts')).toBeNull();
    fireEvent(view.getByLabelText('Messages'), 'valueChange', false);
    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ new_message: false }));
  });
  it('shows retry when preferences could not load', async () => {
    api.getNotificationPreferences.mockRejectedValueOnce(new Error('offline'));
    const S = require('../../src/screens/NotificationSettingsScreen').default;
    const view = render(<S />);
    await view.findByText('Couldn’t load settings. Tap to try again.');
    expect(view.queryByLabelText('Messages')).toBeNull();
  });
