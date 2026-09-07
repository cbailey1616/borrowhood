import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import UserSafetyActions from '../../../src/components/UserSafetyActions';
import api from '../../../src/services/api';
beforeEach(() => { jest.clearAllMocks(); api.getUserSafety.mockResolvedValue({ blocked: false }); api.blockUser.mockResolvedValue({ blocked: true }); api.unblockUser.mockResolvedValue({ blocked: false }); api.reportUser.mockResolvedValue({ ok: true }); });
const open = async props => {
  const screen = render(<UserSafetyActions userId="neighbor" name="Alex" label="More" {...props} />);
  fireEvent.press(screen.getByLabelText('More profile options'));
  await screen.findByText('Block user');
  return screen;
};
it('requires confirmation, supports cancellation, and blocks the selected member once', async () => {
  const changed = jest.fn(); const screen = await open({ onBlockChange: changed });
  fireEvent.press(screen.getByText('Block user'));
  expect(screen.getByText('Block Alex?')).toBeTruthy();
  expect(api.blockUser).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Not now'));
  expect(api.blockUser).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More profile options'));
  fireEvent.press(await screen.findByText('Block user'));
  fireEvent.press(screen.getByText('Block user'));
  await screen.findByText('User blocked');
  expect(api.blockUser).toHaveBeenCalledTimes(1);
  expect(api.blockUser).toHaveBeenCalledWith('neighbor');
  expect(changed).toHaveBeenCalledWith(true);
});
it('offers an explicit unblock action for an already blocked member', async () => {
  api.getUserSafety.mockResolvedValue({ blocked: true });
  const screen = render(<UserSafetyActions userId="neighbor" name="Alex" />);
  fireEvent.press(screen.getByText('Report or block'));
  fireEvent.press(await screen.findByText('Unblock user'));
  expect(api.unblockUser).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Unblock user'));
  await screen.findByText('User unblocked');
  expect(api.unblockUser).toHaveBeenCalledWith('neighbor');
});
it('records a chosen report reason without blocking automatically', async () => {
  const screen = await open();
  fireEvent.press(screen.getByText('Report user'));
  fireEvent.press(screen.getByText('Harassment'));
  await screen.findByText('Thank you for letting us know');
  expect(api.reportUser).toHaveBeenCalledWith('neighbor', 'Harassment');
  expect(api.blockUser).not.toHaveBeenCalled();
});
it('does not claim success after a failed block and offers retry through the menu', async () => {
  api.blockUser.mockRejectedValueOnce(new Error('Offline'));
  const screen = await open();
  fireEvent.press(screen.getByText('Block user'));
  fireEvent.press(screen.getByText('Block user'));
  await screen.findByText('Please try again');
  expect(screen.queryByText('User blocked')).toBeNull();
  fireEvent.press(screen.getByText('Got it'));
  await waitFor(() => expect(screen.getByLabelText('More profile options')).not.toBeDisabled());
});
it('shows direct report and block rows in the profile safety section without a More menu', async () => {
  const screen=render(<UserSafetyActions userId="neighbor" name="Alex" variant="section" />);
  expect(screen.getByText('Safety')).toBeTruthy();
  expect(screen.getByText('Block user')).toBeTruthy();
  expect(screen.queryByText('More')).toBeNull();
  fireEvent.press(screen.getByText('Report user'));
  fireEvent.press(screen.getByText('Inappropriate content'));
  await screen.findByText('Thank you for letting us know');
  expect(api.reportUser).toHaveBeenCalledWith('neighbor','Inappropriate content');
});
