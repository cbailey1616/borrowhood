import React from 'react';
import { Share } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import { inviteToAlpha } from '../../src/utils/alphaInvite';
const mockShowError = jest.fn();
jest.mock('../../src/utils/alphaInvite', () => ({ alphaInviteMessage: () => 'Sample alpha invitation', inviteToAlpha: jest.fn() }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCommunity.mockResolvedValue({ name: 'Maplewood' }); });
const route = { params: { communityId: 'comm-1' } };
it('opens the alpha text invitation with the actual neighborhood name', async () => {
  const Screen = require('../../src/screens/InviteMembersScreen').default;
  const screen = render(<Screen route={route} />);
  await screen.findByText(/Invite someone to share in Maplewood/);
  fireEvent.press(screen.getByText('Invite by text'));
  await waitFor(() => expect(inviteToAlpha).toHaveBeenCalledWith(undefined, expect.stringContaining('find Maplewood under Neighborhoods')));
  expect(screen.queryByText(/BH-COMM/)).toBeNull();
});
it('offers the system share sheet without pretending an email was sent', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  const Screen = require('../../src/screens/InviteMembersScreen').default;
  const screen = render(<Screen route={route} />);
  await screen.findByText(/Invite someone to share in Maplewood/);
  fireEvent.press(screen.getByText('Share another way'));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('Sample alpha invitation') }));
  share.mockRestore();
});
it('shows a recoverable error if the composer cannot open', async () => {
  inviteToAlpha.mockRejectedValueOnce(new Error('Unavailable'));
  const Screen = require('../../src/screens/InviteMembersScreen').default;
  const screen = render(<Screen route={route} />);
  await screen.findByText(/Invite someone to share in Maplewood/);
  fireEvent.press(screen.getByText('Invite by text'));
  await waitFor(() => expect(mockShowError).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Invite by text' })).toBeEnabled();
});
