import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PrivacySafetyScreen from '../../src/screens/PrivacySafetyScreen';
const mockShowError = jest.fn();
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError }) }));
beforeEach(() => jest.clearAllMocks());
it.each([
  ['sharing', 'Manage my posts', 'Main', { screen: 'MyItems' }],
  ['identity', 'View verification', 'IdentityVerification', { source: 'generic' }],
  ['messages', 'Open messages', 'Main', { screen: 'Activity', params: { tab: 'messages' } }],
  ['notifications', 'Notification settings', 'NotificationSettings', undefined],
  ['account', 'Open Profile', 'Main', { screen: 'Profile' }],
])('expands %s and opens its matching action', (id, label, route, params) => {
  const navigation = { navigate: jest.fn() };
  const s = render(<PrivacySafetyScreen navigation={navigation} />);
  fireEvent.press(s.getByTestId(`PrivacySafety.${id}`));
  fireEvent.press(s.getByText(label));
  expect(navigation.navigate.mock.calls[0]).toEqual(params ? [route, params] : [route]);
  fireEvent.press(s.getByTestId(`PrivacySafety.${id}`));
  expect(s.queryByText(label)).toBeNull();
});
it('provides a useful fallback when Android has no mail app', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('No handler'));
  const s = render(<PrivacySafetyScreen navigation={{ navigate: jest.fn() }} />);
  fireEvent.press(s.getByText('Contact support'));
  await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ message: 'You can email us at chris@borrowhood.net.' })));
  jest.restoreAllMocks();
});
