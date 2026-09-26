import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const navigation = { navigate: jest.fn() };
const mockAlert = jest.fn();
const mockShowToast = jest.fn();
const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showToast: mockShowToast, showError: mockShowError }) }));
jest.mock('../../src/components/ThemedAlert', () => ({ ThemedAlert: { alert: (...args) => mockAlert(...args) } }));
beforeEach(() => {
  jest.clearAllMocks();
  api.getCommunityMembers.mockResolvedValue([{ id: 'neighbor', firstName: 'Sam', lastName: 'G', role: 'member' }]);
  api.removeCommunityMember.mockResolvedValue({ success: true });
  api.addCommunityAdmin.mockResolvedValue({ success: true });
  api.getCommunityRejoinRequests.mockResolvedValue([]);
  api.reviewCommunityRejoinRequest.mockResolvedValue({ success: true });
});
it('recovers a notification with no neighborhood ID without requesting an invalid endpoint', async () => {
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen navigation={navigation} />);
  fireEvent.press(await screen.findByText('My neighborhoods'));
  expect(api.getCommunityMembers).not.toHaveBeenCalled();
  expect(navigation.navigate).toHaveBeenCalledWith('MyCommunity');
});
it('keeps organizer controls away from regular members', async () => {
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByText('Sam G'));
  expect(navigation.navigate).toHaveBeenCalledWith('UserProfile', { id: 'neighbor' });
  expect(screen.queryByLabelText('Make Sam a steward')).toBeNull();
  expect(screen.queryByLabelText('Remove Sam')).toBeNull();
});
it('lets a neighborhood moderator remove a regular member', async () => {
  api.getCommunityMembers.mockResolvedValue([
    { id: 'me', firstName: 'Chris', lastName: 'B', role: 'organizer' },
    { id: 'neighbor', firstName: 'Sam', lastName: 'G', role: 'member' },
  ]);
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1', role: 'organizer' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByLabelText('Manage Sam'));
  const Sheet = require('../../src/components/ActionSheet').default;
  act(() => screen.UNSAFE_getByType(Sheet).props.actions.find(action => action.label === 'Remove from neighborhood').onPress());
  expect(mockAlert).toHaveBeenCalledWith('Remove Member', 'Remove Sam from this neighborhood? They’ll need a steward’s approval to rejoin.', expect.any(Array));
  const remove = mockAlert.mock.calls[0][2].find(button => button.text === 'Remove');
  await act(async () => remove.onPress());
  expect(api.removeCommunityMember).toHaveBeenCalledWith('hood-1', 'neighbor');
  expect(screen.queryByText('Sam G')).toBeNull();
  expect(mockShowToast).toHaveBeenCalledWith('Sam removed', 'success');
});
it('labels organizers as moderators and protects them from member controls', async () => {
  api.getCommunityMembers.mockResolvedValue([
    { id: 'me', firstName: 'Chris', lastName: 'B', role: 'organizer' },
    { id: 'moderator', firstName: 'Alex', lastName: 'M', role: 'organizer' },
  ]);
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1', role: 'organizer' } }} navigation={navigation} />);
  expect((await screen.findAllByText('Steward'))).toHaveLength(2);
  expect(screen.queryByLabelText('Remove Alex')).toBeNull();
});
it('offers retry instead of claiming a failed load has no members', async () => {
  api.getCommunityMembers.mockRejectedValueOnce(new Error('Offline'));
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByText('Try again'));
  await screen.findByText('Sam G');
});

it.each(['approve', 'decline'])('lets a moderator %s a return request', async decision => {
  api.getCommunityMembers.mockResolvedValue([{ id: 'me', firstName: 'Chris', role: 'organizer' }]);
  api.getCommunityRejoinRequests.mockResolvedValueOnce([{ id: 'returning', firstName: 'Alex', lastName: 'M.' }]).mockResolvedValue([]);
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByLabelText(`${decision === 'approve' ? 'Approve' : 'Decline'} Alex’s return`));
  await waitFor(() => expect(api.reviewCommunityRejoinRequest).toHaveBeenCalledWith('hood-1', 'returning', decision));
  await waitFor(() => expect(screen.queryByText('Alex M.')).toBeNull());
  expect(mockShowToast).toHaveBeenCalledWith(decision === 'approve' ? 'Alex can rejoin' : 'Request declined', 'success');
});
it('keeps a failed review available for retry and prevents double submission', async () => {
  api.getCommunityMembers.mockResolvedValue([{ id: 'me', firstName: 'Chris', role: 'organizer' }]);
  api.getCommunityRejoinRequests.mockResolvedValue([{ id: 'returning', firstName: 'Alex', lastName: 'M.' }]);
  let reject;
  api.reviewCommunityRejoinRequest.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  const approve = await screen.findByLabelText('Approve Alex’s return');
  fireEvent.press(approve); fireEvent.press(approve);
  expect(api.reviewCommunityRejoinRequest).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('Offline')));
  expect(screen.getByLabelText('Approve Alex’s return')).toBeTruthy();
  expect(mockShowError).toHaveBeenCalledWith({ message: 'Offline' });
});
it('shows retry when requests fail to load and hides requests from ordinary members', async () => {
  api.getCommunityMembers.mockResolvedValue([{ id: 'me', firstName: 'Chris', role: 'organizer' }]);
  api.getCommunityRejoinRequests.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([{ id: 'returning', firstName: 'Alex' }]);
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByText('Retry requests'));
  await screen.findByLabelText('Approve Alex’s return');
  screen.unmount(); api.getCommunityRejoinRequests.mockClear();
  api.getCommunityMembers.mockResolvedValue([{ id: 'me', firstName: 'Chris', role: 'member' }]);
  const regular = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  await regular.findByText('Neighbors');
  expect(api.getCommunityRejoinRequests).not.toHaveBeenCalled();
  expect(regular.queryByText('Rejoin requests')).toBeNull();
});
