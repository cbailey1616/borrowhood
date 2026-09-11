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
  expect(screen.queryByLabelText('Make Sam a moderator')).toBeNull();
  expect(screen.queryByLabelText('Remove Sam')).toBeNull();
});
it('lets a neighborhood moderator remove a regular member', async () => {
  api.getCommunityMembers.mockResolvedValue([
    { id: 'me', firstName: 'Chris', lastName: 'B', role: 'organizer' },
    { id: 'neighbor', firstName: 'Sam', lastName: 'G', role: 'member' },
  ]);
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1', role: 'organizer' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByLabelText('Remove Sam'));
  expect(mockAlert).toHaveBeenCalledWith('Remove Member', 'Remove Sam from this neighborhood?', expect.any(Array));
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
  expect((await screen.findAllByText('Moderator'))).toHaveLength(2);
  expect(screen.queryByLabelText('Remove Alex')).toBeNull();
});
it('offers retry instead of claiming a failed load has no members', async () => {
  api.getCommunityMembers.mockRejectedValueOnce(new Error('Offline'));
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByText('Try again'));
  await screen.findByText('Sam G');
});
