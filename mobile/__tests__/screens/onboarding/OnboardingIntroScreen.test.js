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
  it('explains explicit sharing and free exchanges without a payment step', () => {
    const { getByText, queryByText } = render(<Screen navigation={navigation} />);
    expect(getByText('Private until you share')).toBeTruthy();
    expect(getByText(/Only you can see your things until you choose/)).toBeTruthy();
    expect(getByText(/No fees, deposits, or payment setup/)).toBeTruthy();
    expect(getByText(/Private items stay private/)).toBeTruthy();
    expect(queryByText(/Choose Your Plan/)).toBeNull();
  });
  it('saves progress and goes straight to town setup', async () => {
    const { getByLabelText } = render(<Screen navigation={navigation} />);
    fireEvent.press(getByLabelText('Choose your town'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('OnboardingNeighborhood'));
    expect(api.updateOnboardingStep).toHaveBeenCalledWith(2);
  });
  it('keeps the user on the screen with a retryable error if saving fails', async () => {
    api.updateOnboardingStep.mockRejectedValueOnce(new Error('offline'));
    const { getByLabelText, findByText } = render(<Screen navigation={navigation} />);
    fireEvent.press(getByLabelText('Choose your town'));
    await findByText('Could not save your progress. Please try again.');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
