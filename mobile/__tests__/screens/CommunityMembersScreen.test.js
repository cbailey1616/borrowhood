import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const navigation = { navigate: jest.fn() };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showToast: jest.fn(), showError: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCommunityMembers.mockResolvedValue([{ id: 'neighbor', firstName: 'Sam', lastName: 'G', role: 'member' }]); });
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
  expect(screen.queryByLabelText('Make Sam an admin')).toBeNull();
});
it('offers retry instead of claiming a failed load has no members', async () => {
  api.getCommunityMembers.mockRejectedValueOnce(new Error('Offline'));
  const Screen = require('../../src/screens/CommunityMembersScreen').default;
  const screen = render(<Screen route={{ params: { id: 'hood-1' } }} navigation={navigation} />);
  fireEvent.press(await screen.findByText('Try again'));
  await screen.findByText('Sam G');
});
