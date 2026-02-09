import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('UserBadges', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when no badges', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { toJSON } = render(
      <UserBadges isVerified={false} totalTransactions={0} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders verified badge', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={true} totalTransactions={0} />
    );
    expect(getByText('Verified')).toBeTruthy();
  });

  it('renders trusted badge for 10+ transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={15} />
    );
    expect(getByText('Trusted')).toBeTruthy();
  });

  it('renders power user badge for 25+ transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={30} />
    );
    expect(getByText('Power User')).toBeTruthy();
  });
});
