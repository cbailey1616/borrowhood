import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import Screen from '../../src/screens/NotificationSettingsScreen';

beforeEach(() => {
  jest.clearAllMocks();
  api.getNotificationPreferences.mockResolvedValue({ push_enabled: true });
  api.updateNotificationPreferences.mockResolvedValue({ success: true });
});

it('shows core audience choices immediately without expandable menus', async () => {
  const view = render(<Screen />);
  await view.findByText('New requests');
  for (const category of ['Item requests', 'Service requests']) {
    for (const source of ['Friends', 'Neighbors', 'Town']) expect(view.getByLabelText(`${category}: ${source}`)).toBeTruthy();
  }
  expect(view.queryByLabelText('Messages: Friends')).toBeNull();
  expect(view.getByLabelText('Messages')).toBeTruthy();
  expect(view.queryByLabelText('Matches for your requests')).toBeNull();
  expect(view.queryByText('Request approvals')).toBeNull();
  expect(api.updateNotificationPreferences).not.toHaveBeenCalled();
});
it('changes one audience without enabling the other audiences or categories', async () => {
  api.getNotificationPreferences.mockResolvedValueOnce({ new_service_requests: false, source_town: false });
  const view = render(<Screen />);
  fireEvent(await view.findByLabelText('Service requests: Friends'), 'valueChange', true);
  await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledWith({
    new_service_requests: true, new_service_requests_source_friends: true,
    new_service_requests_source_neighborhood: false, new_service_requests_source_town: false,
  }));
  expect(view.getByLabelText('Service requests: Friends').props.value).toBe(true);
  expect(view.getByLabelText('Service requests: Town').props.value).toBe(false);
  expect(view.getByLabelText('Messages').props.value).toBe(true);
});
it('restores the whole row if saving fails', async () => {
  api.updateNotificationPreferences.mockRejectedValueOnce(new Error('offline'));
  const view = render(<Screen />);
  fireEvent(await view.findByLabelText('Service requests: Town'), 'valueChange', false);
  await view.findByText('Couldn’t save that change. Please try again.');
  expect(view.getByLabelText('Service requests: Town').props.value).toBe(true);
});
it('disables child controls while push is off and saves the master switch', async () => {
  api.getNotificationPreferences.mockResolvedValueOnce({ push_enabled: false });
  const view = render(<Screen />);
  await view.findByText('New requests');
  for (const label of ['Messages', 'Service requests: Town', 'Sound', 'Return reminders']) expect(view.getByLabelText(label)).toBeDisabled();
  expect(view.getByLabelText('Push notifications')).not.toBeDisabled();
  fireEvent(view.getByLabelText('Push notifications'), 'valueChange', true);
  await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ push_enabled: true }));
});
it('offers retry instead of editable defaults when loading fails', async () => {
  api.getNotificationPreferences.mockRejectedValueOnce(new Error('offline'));
  const view = render(<Screen />);
  await view.findByText('Couldn’t load settings. Tap to try again.');
  expect(view.queryByLabelText('Messages')).toBeNull();
  fireEvent.press(view.getByText('Couldn’t load settings. Tap to try again.'));
  await view.findByLabelText('Messages');
});

it('saves a simple activity switch without audience choices', async () => {
 const view=render(<Screen/>);
 fireEvent(await view.findByLabelText('Messages'),'valueChange',false);
 await waitFor(()=>expect(api.updateNotificationPreferences).toHaveBeenCalledWith({new_message:false}));
});

it('restores each request audience after leaving and reopening settings', async () => {
  let saved = { push_enabled: true };
  api.getNotificationPreferences.mockImplementation(async () => saved);
  api.updateNotificationPreferences.mockImplementation(async patch => { saved = { ...saved, ...patch }; return { success: true, preferences: saved }; });
  const first = render(<Screen />);
  fireEvent(await first.findByLabelText('Item requests: Town'), 'valueChange', false);
  await waitFor(() => expect(first.getByLabelText('Item requests: Town')).not.toBeDisabled());
  fireEvent(first.getByLabelText('Service requests: Neighbors'), 'valueChange', false);
  await waitFor(() => expect(first.getByLabelText('Service requests: Neighbors')).not.toBeDisabled());
  first.unmount();
  const reopened = render(<Screen />);
  await reopened.findByLabelText('Item requests: Town');
  expect(reopened.getByLabelText('Item requests: Town').props.value).toBe(false);
  expect(reopened.getByLabelText('Service requests: Neighbors').props.value).toBe(false);
  expect(reopened.getByLabelText('Item requests: Neighbors').props.value).toBe(true);
  expect(reopened.getByLabelText('Messages').props.value).toBe(true);
});
