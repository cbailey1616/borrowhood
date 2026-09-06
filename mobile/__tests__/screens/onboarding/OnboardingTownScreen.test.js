import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import api from '../../../src/services/api';
import Screen from '../../../src/screens/onboarding/OnboardingTownScreen';

const mockRefreshUser = jest.fn();
let mockUser = { firstName: 'Chris' };
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { firstName: 'Chris' };
  api.updateProfile.mockResolvedValue({});
  api.completeOnboarding.mockResolvedValue({});
});

describe('town setup', () => {
  it('asks for a missing Apple name on the town screen and saves everything together', async () => {
    mockUser = { firstName: '', onboardingStep: 2 };
    const screen = render(<Screen />);
    fireEvent.changeText(screen.getByLabelText('Town or city'), 'Upton');
    fireEvent.changeText(screen.getByLabelText('State'), 'MA');
    fireEvent.press(screen.getByText('Continue to Borrowhood'));
    expect(api.completeOnboarding).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Your first name'), ' Chris ');
    fireEvent.press(screen.getByText('Continue to Borrowhood'));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(api.updateProfile).toHaveBeenCalledWith({ city: 'Upton', state: 'MA', firstName: 'Chris' });
  });
  it('does not ask for a name already supplied by the provider', () => {
    const screen = render(<Screen />);
    expect(screen.queryByLabelText('Your first name')).toBeNull();
  });
  it('does not request device location without a tap', () => {
    const { getByText } = render(<Screen />);
    expect(getByText('Verify later to share and ask across your town.')).toBeTruthy();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('requires town and state and does not finish an empty form', () => {
    const { getByText } = render(<Screen />);
    fireEvent.press(getByText('Continue to Borrowhood'));
    expect(getByText('Enter your town and state to continue.')).toBeTruthy();
    expect(api.completeOnboarding).not.toHaveBeenCalled();
  });
  it('saves only town and state without coordinates or publishing inventory', async () => {
    const { getByLabelText, getByText } = render(<Screen />);
    fireEvent.changeText(getByLabelText('Town or city'), ' Upton ');
    fireEvent.changeText(getByLabelText('State'), ' MA ');
    fireEvent.press(getByText('Continue to Borrowhood'));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(api.updateProfile).toHaveBeenCalledWith({ city: 'Upton', state: 'MA' });
    expect(api.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(api.createListing).not.toHaveBeenCalled();
  });
  it('does not complete onboarding after a failed profile save', async () => {
    api.updateProfile.mockRejectedValueOnce(new Error('offline'));
    const { getByLabelText, getByText, findByText } = render(<Screen />);
    fireEvent.changeText(getByLabelText('Town or city'), 'Upton');
    fireEvent.changeText(getByLabelText('State'), 'MA');
    fireEvent.press(getByText('Continue to Borrowhood'));
    await findByText('Could not finish setup. Check your connection and try again.');
    expect(api.completeOnboarding).not.toHaveBeenCalled();
  });
});
