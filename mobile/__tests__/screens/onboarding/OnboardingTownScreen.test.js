import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Location from 'expo-location';
import api from '../../../src/services/api';
import Screen from '../../../src/screens/onboarding/OnboardingTownScreen';
import navigationVisit from '../../setup/navigationVisit';

const mockRefreshUser = jest.fn();
const chooseState = screen => {
  fireEvent.press(screen.getByLabelText('Choose state'));
  fireEvent(screen.getByTestId('Onboarding.statePicker'), 'valueChange', 'MA');
  fireEvent.press(screen.getByText('Done'));
};
let visit;
let navigation;
let mockUser = { firstName: 'Chris' };
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));

beforeEach(() => {
  jest.clearAllMocks();
  visit = navigationVisit();
  navigation = visit.navigation;
  mockUser = { firstName: 'Chris' };
  api.updateProfile.mockResolvedValue({});
  api.completeOnboarding.mockResolvedValue({});
  api.updateOnboardingStep.mockResolvedValue({});
  mockRefreshUser.mockResolvedValue({});
});

describe('town setup', () => {
  it('asks for a missing Apple name on the town screen and saves everything together', async () => {
    mockUser = { firstName: '', onboardingStep: 2 };
    const screen = render(<Screen navigation={navigation} />);
    fireEvent.changeText(screen.getByLabelText('Town or city'), 'Upton');
    chooseState(screen);
    fireEvent.press(screen.getByText('Continue'));
    expect(api.completeOnboarding).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Your first name'), ' Chris ');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(api.updateProfile).toHaveBeenCalledWith({ city: 'Upton', state: 'MA', firstName: 'Chris' });
  });
  it('prefills a name already supplied by the provider', () => {
    const screen = render(<Screen navigation={navigation} />);
    expect(screen.getByLabelText('Your first name').props.value).toBe('Chris');
  });
  it('does not request device location without a tap', () => {
    const { getByText } = render(<Screen navigation={navigation} />);
    expect(getByText('See what’s being shared near you.')).toBeTruthy();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('requires town and state and does not finish an empty form', () => {
    const { getByText } = render(<Screen navigation={navigation} />);
    fireEvent.press(getByText('Continue'));
    expect(getByText('Enter your town and state to continue.')).toBeTruthy();
    expect(api.completeOnboarding).not.toHaveBeenCalled();
  });
  it('saves only town and state without coordinates or publishing inventory', async () => {
    const screen = render(<Screen navigation={navigation} />);
    const { getByLabelText, getByText } = screen;
    fireEvent.changeText(getByLabelText('Town or city'), ' Upton ');
    chooseState(screen);
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(api.updateProfile).toHaveBeenCalledWith({ city: 'Upton', state: 'MA', firstName: 'Chris' });
    expect(api.completeOnboarding).not.toHaveBeenCalled();
    expect(api.updateOnboardingStep).toHaveBeenCalledWith(2);
    expect(navigation.navigate).toHaveBeenCalledWith('OnboardingNeighborhood');
    expect(api.createListing).not.toHaveBeenCalled();
  });
  it('does not complete onboarding after a failed profile save', async () => {
    api.updateProfile.mockRejectedValueOnce(new Error('offline'));
    const screen = render(<Screen navigation={navigation} />);
    const { getByLabelText, getByText, findByText } = screen;
    fireEvent.changeText(getByLabelText('Town or city'), 'Upton');
    chooseState(screen);
    fireEvent.press(getByText('Continue'));
    await findByText('Could not save your details. Check your connection and try again.');
    expect(api.completeOnboarding).not.toHaveBeenCalled();
  });

  it('fills both fields from location and saves a canonical state code', async () => {
    Location.reverseGeocodeAsync.mockResolvedValueOnce([{ city: 'Upton', region: 'Massachusetts' }]);
    const screen = render(<Screen navigation={navigation} />);
    fireEvent.press(screen.getByText('Use my current location'));
    await screen.findByText('Massachusetts');
    expect(screen.getByLabelText('Town or city').props.value).toBe('Upton');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ city: 'Upton', state: 'MA', firstName: 'Chris' }));
  });

  it('can finish manually after location permission is denied', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const screen = render(<Screen navigation={navigation} />);
    fireEvent.press(screen.getByText('Use my current location'));
    await screen.findByText('Enter your town below to continue without location access.');
    fireEvent.changeText(screen.getByLabelText('Town or city'), 'Upton');
    chooseState(screen);
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ city: 'Upton', state: 'MA', firstName: 'Chris' }));
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('does not silently pick a state when the wheel is dismissed without a selection', () => {
    const screen = render(<Screen navigation={navigation} />);
    fireEvent.changeText(screen.getByLabelText('Town or city'), 'Upton');
    fireEvent.press(screen.getByLabelText('Choose state'));
    fireEvent.press(screen.getByText('Done'));
    fireEvent.press(screen.getByText('Continue'));
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText('Enter your town and state to continue.')).toBeTruthy();
  });
});

it('stays on town setup when progress cannot be saved', async () => {
  mockUser = { firstName: 'Chris', city: 'Upton', state: 'MA' };
  api.updateOnboardingStep.mockRejectedValueOnce(new Error('offline'));
  const screen = render(<Screen navigation={navigation} />);
  fireEvent.press(screen.getByText('Continue'));
  await screen.findByText('Could not save your details. Check your connection and try again.');
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(api.completeOnboarding).not.toHaveBeenCalled();
});
it('preserves verified identity fields when continuing', async () => {
  mockUser = { firstName: 'Chris', city: 'Upton', state: 'MA', isVerified: true };
  const screen = render(<Screen navigation={navigation} />);
  expect(screen.getByLabelText('Your first name').props.editable).toBe(false);
  expect(screen.queryByText('Use my current location')).toBeNull();
  fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('OnboardingNeighborhood'));
  expect(api.updateProfile).not.toHaveBeenCalled();
});
it('keeps town fields and Continue usable when returning from neighborhoods', async () => {
  mockUser = { firstName: 'Chris', city: 'Upton', state: 'MA' };
  const screen = render(<Screen navigation={navigation} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Continue' })));
  expect(navigation.navigate).toHaveBeenCalledWith('OnboardingNeighborhood');
  await act(async () => visit.focus());
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(screen.getByLabelText('Town or city').props.editable).toBe(true);
  fireEvent.changeText(screen.getByLabelText('Town or city'), 'Mendon');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Continue' })));
  expect(api.updateProfile).toHaveBeenLastCalledWith({ firstName: 'Chris', city: 'Mendon', state: 'MA' });
  expect(navigation.navigate).toHaveBeenCalledTimes(2);
});
it('releases location controls without applying a result from a previous visit', async () => {
  let resolve;
  Location.requestForegroundPermissionsAsync.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const screen = render(<Screen navigation={navigation} />);
  fireEvent.press(screen.getByRole('button', { name: 'Use my current location' }));
  act(() => visit.blur());
  await act(async () => visit.focus());
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await act(async () => resolve({ status: 'granted' }));
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(screen.getByLabelText('Town or city').props.editable).toBe(true);
});
