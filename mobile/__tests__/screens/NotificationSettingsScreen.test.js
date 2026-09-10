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

it('saves independent alert and source choices on a granular-capable server', async () => {
  api.getNotificationPreferences.mockResolvedValueOnce({ push_enabled: true, new_service_requests: true, new_item_requests: false, source_friends: true, source_neighborhood: true, source_town: false });
  api.updateNotificationPreferences.mockResolvedValue({ success: true });
  const S = require('../../src/screens/NotificationSettingsScreen').default;
  const view = render(<S />);
  fireEvent.press(await view.findByLabelText('Requests & matches'));
  await view.findByText('New service requests');
  expect(view.getByLabelText('New item requests').props.value).toBe(false);
  expect(view.getByLabelText('Town').props.value).toBe(false);
  fireEvent(view.getByLabelText('New service requests'), 'valueChange', false);
  await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenLastCalledWith({ new_service_requests: false }));
  await waitFor(() => expect(view.getByLabelText('Friends')).not.toBeDisabled());
  fireEvent(view.getByLabelText('Friends'), 'valueChange', false);
  await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenLastCalledWith({ source_friends: false }));
  fireEvent.press(view.getByLabelText('Messages & replies'));
  expect(view.getByLabelText('Messages').props.value).toBe(true);
  expect(view.getByLabelText('Neighborhood').props.value).toBe(true);
});
it('restores a source switch if its save fails', async () => {
  api.getNotificationPreferences.mockResolvedValueOnce({ new_service_requests: true, source_town: true });
  api.updateNotificationPreferences.mockRejectedValueOnce(new Error('offline'));
  const S = require('../../src/screens/NotificationSettingsScreen').default;
  const view = render(<S />);
  fireEvent.press(await view.findByLabelText('Requests & matches'));
  await view.findByText('Town');
  fireEvent(view.getByLabelText('Town'), 'valueChange', false);
  await view.findByText('Couldn’t save that change. Please try again.');
  expect(view.getByLabelText('Town').props.value).toBe(true);
});
it('disables every child switch while master push is off', async () => {
  api.getNotificationPreferences.mockResolvedValueOnce({ push_enabled: false, new_service_requests: true });
  const S = require('../../src/screens/NotificationSettingsScreen').default;
  const view = render(<S />);
  fireEvent.press(await view.findByLabelText('Requests & matches'));
  await view.findByText('Town');
  fireEvent.press(view.getByLabelText('Messages & replies'));
  fireEvent.press(view.getByLabelText('Exchanges'));
  for (const label of ['Town', 'Friends', 'New service requests', 'Messages', 'Request approvals']) expect(view.getByLabelText(label)).toBeDisabled();
  expect(view.getByLabelText('Push notifications')).not.toBeDisabled();
});

it('shows four compact groups without changing any preferences when expanded', async () => {
  api.getNotificationPreferences.mockResolvedValueOnce({ new_service_requests: false, source_town: false });
  const S = require('../../src/screens/NotificationSettingsScreen').default;
  const view = render(<S />);
  await view.findByLabelText('Requests & matches');
  expect(view.queryByLabelText('Town')).toBeNull();
  expect(view.queryByLabelText('Request approvals')).toBeNull();
  expect(view.getAllByRole('switch')).toHaveLength(2);
  fireEvent.press(view.getByLabelText('Requests & matches'));
  expect(view.getByLabelText('Town').props.value).toBe(false);
  expect(view.getByLabelText('New service requests').props.value).toBe(false);
  expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
});
