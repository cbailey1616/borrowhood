import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const navigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
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
  api.leaveCommunity.mockResolvedValue({ success: true });
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

describe('steward handoff', () => {
  const route = { params: { id: 'hood-1', role: 'organizer', handoff: true } };
  const renderHandoff = () => {
    const Screen = require('../../src/screens/CommunityMembersScreen').default;
    return render(<Screen route={route} navigation={navigation} />);
  };
  const confirmation = () => mockAlert.mock.calls.at(-1)[2].find(button => button.text === 'Make steward & leave');

  it('shows eligible neighbors without unrelated member controls and requires confirmation', async () => {
    const screen = renderHandoff();
    fireEvent.press(await screen.findByLabelText('Choose Sam as steward'));
    expect(api.getCommunityMembers).toHaveBeenCalledWith('hood-1', { limit: 100, forSteward: true, page: 1 });
    expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Choose a steward' });
    expect(api.getCommunityRejoinRequests).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Invite neighbors')).toBeNull();
    expect(screen.queryByLabelText('Manage Sam')).toBeNull();
    expect(mockAlert).toHaveBeenCalledWith('Make steward & leave?', 'Sam will look after the neighborhood. You’ll leave it.', expect.any(Array));
    const cancel = mockAlert.mock.calls[0][2].find(button => button.text === 'Cancel');
    act(() => cancel.onPress?.());
    expect(api.leaveCommunity).not.toHaveBeenCalled();
    expect(api.addCommunityAdmin).not.toHaveBeenCalled();
  });

  it('passes stewardship and leaves in one request, guarding double taps', async () => {
    let finish;
    api.leaveCommunity.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const screen = renderHandoff();
    fireEvent.press(await screen.findByLabelText('Choose Sam as steward'));
    const confirm = confirmation();
    act(() => { confirm.onPress(); confirm.onPress(); });
    expect(api.leaveCommunity).toHaveBeenCalledTimes(1);
    expect(api.leaveCommunity).toHaveBeenCalledWith('hood-1', { successorId: 'neighbor' });
    expect(api.addCommunityAdmin).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    await act(async () => finish({ success: true }));
    expect(navigation.navigate).toHaveBeenCalledWith('Main');
    expect(mockShowToast).toHaveBeenCalledWith('Stewardship passed on. You’ve left the neighborhood.', 'success');
  });

  it('stays on the picker after failure and allows another attempt', async () => {
    api.leaveCommunity.mockRejectedValueOnce(new Error('Offline'));
    const screen = renderHandoff();
    fireEvent.press(await screen.findByLabelText('Choose Sam as steward'));
    await act(async () => confirmation().onPress());
    expect(mockShowError).toHaveBeenCalledWith({ message: 'Offline' });
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Choose Sam as steward'));
    await act(async () => confirmation().onPress());
    expect(api.leaveCommunity).toHaveBeenCalledTimes(2);
    expect(navigation.navigate).toHaveBeenCalledWith('Main');
  });

  it('refreshes unavailable candidates and offers a way back if nobody remains', async () => {
    api.getCommunityMembers.mockResolvedValueOnce([{ id: 'neighbor', firstName: 'Sam' }]).mockResolvedValue([]);
    api.leaveCommunity.mockRejectedValueOnce(Object.assign(new Error('Choose another steward'), { code: 'INVALID_STEWARD' }));
    const screen = renderHandoff();
    fireEvent.press(await screen.findByLabelText('Choose Sam as steward'));
    await act(async () => confirmation().onPress());
    expect(api.getCommunityMembers).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Choose Sam as steward')).toBeNull();
    fireEvent.press(screen.getByText('Back to neighborhood'));
    expect(navigation.goBack).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalledWith('Main');
  });

  it('does not navigate away from another screen when a handoff finishes late', async () => {
    let finish;
    api.leaveCommunity.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const screen = renderHandoff();
    fireEvent.press(await screen.findByLabelText('Choose Sam as steward'));
    act(() => { confirmation().onPress(); });
    screen.unmount();
    await act(async () => finish({ success: true }));
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('offers every eligible neighbor through paging', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ id: `neighbor-${i}`, firstName: `Neighbor ${i}` }));
    api.getCommunityMembers.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([{ id: 'neighbor-100', firstName: 'Last neighbor' }]);
    const screen = renderHandoff();
    fireEvent.press(await screen.findByText('More neighbors'));
    await waitFor(() => expect(api.getCommunityMembers).toHaveBeenCalledWith('hood-1', { limit: 100, forSteward: true, page: 2 }));
    const list = screen.UNSAFE_getByType(require('react-native').FlatList);
    await waitFor(() => expect(list.props.data).toHaveLength(101));
    expect(list.props.data.at(-1).id).toBe('neighbor-100');
    expect(screen.queryByText('More neighbors')).toBeNull();
  });
});
