import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../../src/services/api';
import Screen from '../../../src/screens/onboarding/OnboardingIntroScreen';

const navigation = { navigate: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  api.updateOnboardingStep.mockResolvedValue({});
});

describe('private-first onboarding', () => {
  it('explains sharing and arranging details without a payment step', () => {
    const { getByText, queryByText } = render(<Screen navigation={navigation} />);
    expect(getByText('Ask before you buy')).toBeTruthy();
    expect(getByText('Lend, give away, or sell')).toBeTruthy();
    expect(getByText('Get to know your neighbors')).toBeTruthy();
    expect(getByText('Get started now. Verify your identity later.')).toBeTruthy();
    expect(queryByText(/Choose Your Plan/)).toBeNull();
  });
  it('introduces audience control and verified neighbors before town setup', async () => {
    const { getByLabelText } = render(<Screen navigation={navigation} />);
    fireEvent.press(getByLabelText('Continue'));
    fireEvent.press(getByLabelText('Choose your town'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('OnboardingNeighborhood'));
    expect(api.updateOnboardingStep).toHaveBeenCalledWith(2);
  });
  it('explains friends, neighborhoods, town and identity verification', () => {
    const { getByLabelText, getByText } = render(<Screen navigation={navigation} />);
    fireEvent.press(getByLabelText('Continue'));
    expect(getByText('Friends.\nNeighborhood. Town.')).toBeTruthy();
    expect(getByText('Verified neighbors. More confidence.')).toBeTruthy();
    expect(api.updateOnboardingStep).not.toHaveBeenCalled();
  });
  it('keeps the user on the screen with a retryable error if saving fails', async () => {
    api.updateOnboardingStep.mockRejectedValueOnce(new Error('offline'));
    const { getByLabelText, findByText } = render(<Screen navigation={navigation} />);
    fireEvent.press(getByLabelText('Continue'));
    fireEvent.press(getByLabelText('Choose your town'));
    await findByText('Could not save your progress. Please try again.');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
