import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Location from 'expo-location';
import api from '../../../src/services/api';
import Screen from '../../../src/screens/onboarding/OnboardingNeighborhoodScreen';
const navigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };
const mockRefreshUser = jest.fn();
const mockUser = { id: 'user-1', firstName: 'Chris', city: 'Upton', state: 'MA' };
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));
const neighborhood = { id: 'n-1', name: 'Oak Street', memberCount: 12, isMember: false };
beforeEach(() => {
  jest.clearAllMocks();
  api.getCommunities.mockResolvedValue([]);
  api.joinCommunity.mockResolvedValue({ success: true });
  api.createCommunity.mockResolvedValue({ id: 'new-1', isFounder: true });
  api.updateOnboardingStep.mockResolvedValue({});
  mockRefreshUser.mockResolvedValue(mockUser);
});
const press = async (screen, label) => { const button = await screen.findByRole('button', { name: label }); await act(async () => fireEvent.press(button)); };
it('offers create and skip when the town has no neighborhoods without requesting location', async () => {
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('No neighborhoods nearby yet');
  expect(screen.getByRole('button', { name: 'Create a neighborhood' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(api.getNearbyNeighborhoods).not.toHaveBeenCalled();
});
it('skips directly to verification without joining or completing onboarding', async () => {
  const screen = render(<Screen navigation={navigation} />);
  await press(screen, 'Not now');
  expect(api.updateOnboardingStep).toHaveBeenCalledWith(3);
  expect(navigation.navigate).toHaveBeenCalledWith('OnboardingVerify');
  expect(api.joinCommunity).not.toHaveBeenCalled();
  expect(api.completeOnboarding).not.toHaveBeenCalled();
});
it('shows retry rather than an empty town after a failed lookup', async () => {
  api.getCommunities.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([neighborhood]);
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('Couldn’t load neighborhoods');
  expect(screen.queryByText('No neighborhoods nearby yet')).toBeNull();
  await press(screen, 'Retry');
  expect(screen.getByRole('radio', { name: 'Oak Street, 12 neighbors' })).toBeTruthy();
});
it('joins only the selected neighborhood before advancing', async () => {
  api.getCommunities.mockResolvedValue([neighborhood]);
  const screen = render(<Screen navigation={navigation} />);
  fireEvent.press(await screen.findByRole('radio', { name: 'Oak Street, 12 neighbors' }));
  await press(screen, 'Join neighborhood');
  expect(api.joinCommunity).toHaveBeenCalledTimes(1);
  expect(api.joinCommunity).toHaveBeenCalledWith('n-1');
  expect(navigation.navigate).toHaveBeenCalledWith('OnboardingVerify');
});
it('keeps a successful join when saving progress fails so retry does not join twice', async () => {
  api.getCommunities.mockResolvedValue([neighborhood]);
  api.updateOnboardingStep.mockRejectedValueOnce(new Error('Could not save progress'));
  const screen = render(<Screen navigation={navigation} />);
  fireEvent.press(await screen.findByRole('radio', { name: 'Oak Street, 12 neighbors' }));
  await press(screen, 'Join neighborhood');
  expect(navigation.navigate).not.toHaveBeenCalled();
  await press(screen, 'Continue');
  expect(api.joinCommunity).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith('OnboardingVerify');
});
it('does not advance when joining fails', async () => {
  api.getCommunities.mockResolvedValue([neighborhood]);
  api.joinCommunity.mockRejectedValueOnce(new Error('Could not join'));
  const screen = render(<Screen navigation={navigation} />);
  fireEvent.press(await screen.findByRole('radio', { name: 'Oak Street, 12 neighbors' }));
  await press(screen, 'Join neighborhood');
  expect(screen.getByText('Could not join')).toBeTruthy();
  expect(api.updateOnboardingStep).not.toHaveBeenCalled();
});
it('creates a neighborhood using the saved town without sending coordinates or joining twice', async () => {
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('No neighborhoods nearby yet');
  await press(screen, 'Create a neighborhood');
  fireEvent.changeText(screen.getByLabelText('Neighborhood name'), ' Oak Street ');
  await press(screen, 'Create neighborhood');
  expect(api.createCommunity).toHaveBeenCalledWith({ name: 'Oak Street' });
  expect(api.joinCommunity).not.toHaveBeenCalled();
  expect(navigation.navigate).toHaveBeenCalledWith('OnboardingVerify');
});
it('keeps the new neighborhood if progress fails and prevents a second creation on retry', async () => {
  api.updateOnboardingStep.mockRejectedValueOnce(new Error('Progress save failed'));
  const screen = render(<Screen navigation={navigation} />);
  await screen.findByText('No neighborhoods nearby yet');
  await press(screen, 'Create a neighborhood');
  fireEvent.changeText(screen.getByLabelText('Neighborhood name'), 'Oak Street');
  await press(screen, 'Create neighborhood');
  expect(screen.getByText('Progress save failed')).toBeTruthy();
  await press(screen, 'Continue');
  expect(api.createCommunity).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith('OnboardingVerify');
});
it('does not navigate after the user leaves during a join', async () => {
  let resolve;
  api.getCommunities.mockResolvedValue([neighborhood]);
  api.joinCommunity.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const screen = render(<Screen navigation={navigation} />);
  fireEvent.press(await screen.findByRole('radio', { name: 'Oak Street, 12 neighbors' }));
  fireEvent.press(screen.getByRole('button', { name: 'Join neighborhood' }));
  await waitFor(() => expect(api.joinCommunity).toHaveBeenCalledTimes(1));
  act(() => navigation.addListener.mock.calls.find(([event]) => event === 'blur')[1]());
  await act(async () => resolve({ success: true }));
  expect(api.updateOnboardingStep).not.toHaveBeenCalled();
  expect(navigation.navigate).not.toHaveBeenCalled();
});
