import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import api from '../../../src/services/api';
import Screen from '../../../src/screens/onboarding/OnboardingTownScreen';

const mockRefreshUser = jest.fn();
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: {}, refreshUser: mockRefreshUser }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.updateProfile.mockResolvedValue({});
  api.completeOnboarding.mockResolvedValue({});
});

describe('town setup', () => {
  it('does not request device location without a tap', () => {
    const { getByText } = render(<Screen />);
    expect(getByText(/Town-wide requests and sharing require completed ID verification/)).toBeTruthy();
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
