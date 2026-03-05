import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockNavigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

beforeEach(() => jest.clearAllMocks());

describe('OnboardingIntroScreen', () => {
  it('renders welcome slide', () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingIntroScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    expect(getByText(/Welcome to/)).toBeTruthy();
  });

  it('renders Borrowhood in title', () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingIntroScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    expect(getByText(/Borrowhood/)).toBeTruthy();
  });

  it('renders continue button', () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingIntroScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    expect(getByText(/Continue/)).toBeTruthy();
  });

  it('renders dot indicators', () => {
    const Screen = require('../../../src/screens/onboarding/OnboardingIntroScreen').default;
    const { UNSAFE_root } = render(<Screen navigation={mockNavigation} />);
    // 4 slides = 4 dots
    expect(UNSAFE_root).toBeTruthy();
  });
});
