import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
import CircleDetailScreen from '../../src/screens/CircleDetailScreen';
const group = { name: 'Garden friends', userRole: 'owner', members: [{ id: 'member', firstName: 'Sam', role: 'member' }], items: [{ id: 'drill', title: 'Drill', listingType: 'lend' }] };
beforeEach(() => {
  jest.clearAllMocks();
  api.getCircle = jest.fn().mockResolvedValue(group);
  api.getFriends = jest.fn().mockResolvedValue([{ id: 'member', firstName: 'Sam' }, { id: 'new', firstName: 'Taylor', lastName: 'K' }]);
});
it('opens shared item details and excludes existing members from invite choices', async () => {
  const navigation = { navigate: jest.fn() };
  const s = render(<CircleDetailScreen route={{ params: { circleId: 'garden' } }} navigation={navigation} />);
  fireEvent.press(await s.findByText('Drill'));
  expect(navigation.navigate).toHaveBeenCalledWith('ListingDetail', { id: 'drill' });
  fireEvent.press(s.getByText('Invite a friend'));
  expect(await s.findByText('Taylor K')).toBeTruthy();
  expect(s.queryAllByText(/^Sam/)).toHaveLength(1);
  expect(api.getCircle).toHaveBeenCalledWith('garden');
});
it('recovers from a failed load through the retry action', async () => {
  api.getCircle.mockRejectedValueOnce(new Error('Offline'));
  const s = render(<CircleDetailScreen route={{ params: { circleId: 'garden' } }} navigation={{ navigate: jest.fn() }} />);
  fireEvent.press(await s.findByText('Could not load this group. Tap to retry.'));
  expect(await s.findByText('Garden friends')).toBeTruthy();
  expect(api.getCircle).toHaveBeenCalledTimes(2);
});
it('hides invitation controls from regular members', async () => {
  api.getCircle.mockResolvedValue({ ...group, userRole: 'member', items: [] });
  const s = render(<CircleDetailScreen route={{ params: { circleId: 'garden' } }} navigation={{ navigate: jest.fn() }} />);
  expect(await s.findByText('No items shared with this group yet.')).toBeTruthy();
  expect(s.queryByText('Invite a friend')).toBeNull();
});
