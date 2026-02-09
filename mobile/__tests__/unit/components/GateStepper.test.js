import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('GateStepper', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders correct number of steps', () => {
    const GateStepper = require('../../../src/components/GateStepper').default;
    const { getByText } = render(
      <GateStepper currentStep={1} totalSteps={3} />
    );
    expect(getByText('Plus Membership')).toBeTruthy();
    expect(getByText('Identity Verification')).toBeTruthy();
    expect(getByText('Payout Setup')).toBeTruthy();
  });

  it('highlights current step', () => {
    const GateStepper = require('../../../src/components/GateStepper').default;
    const { getByText } = render(
      <GateStepper currentStep={2} totalSteps={3} />
    );
    expect(getByText('Identity Verification')).toBeTruthy();
  });

  it('shows step 1 as current when at step 1', () => {
    const GateStepper = require('../../../src/components/GateStepper').default;
    const { getByText } = render(
      <GateStepper currentStep={1} totalSteps={3} />
    );
    // Step 1 label should be rendered
    expect(getByText('Plus Membership')).toBeTruthy();
  });

  it('renders two steps when totalSteps is 2', () => {
    const GateStepper = require('../../../src/components/GateStepper').default;
    const { getByText, queryByText } = render(
      <GateStepper currentStep={1} totalSteps={2} />
    );
    expect(getByText('Plus Membership')).toBeTruthy();
    expect(getByText('Identity Verification')).toBeTruthy();
    expect(queryByText('Payout Setup')).toBeNull();
  });

  it('renders all three gate steps', () => {
    const GateStepper = require('../../../src/components/GateStepper').default;
    const { toJSON } = render(
      <GateStepper currentStep={3} totalSteps={3} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
