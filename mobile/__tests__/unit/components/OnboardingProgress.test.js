import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('OnboardingProgress', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders 5 step dots', () => {
    const OnboardingProgress = require('../../../src/components/OnboardingProgress').default;
    const { toJSON } = render(<OnboardingProgress currentStep={1} />);
    const tree = toJSON();
    // Should have a container with 5 children (dots)
    expect(tree.children.length).toBe(5);
  });

  it('renders with different current step', () => {
    const OnboardingProgress = require('../../../src/components/OnboardingProgress').default;
    const { toJSON } = render(<OnboardingProgress currentStep={3} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders at step 5 (final)', () => {
    const OnboardingProgress = require('../../../src/components/OnboardingProgress').default;
    const { toJSON } = render(<OnboardingProgress currentStep={5} />);
    expect(toJSON()).toBeTruthy();
  });
});
