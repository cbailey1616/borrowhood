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

  it('renders Squire tier when no transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={0} />
    );
    expect(getByText('Squire')).toBeTruthy();
  });

  it('renders verified badge', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={true} totalTransactions={0} />
    );
    expect(getByText('Verified')).toBeTruthy();
  });

  it('renders Outlaw tier for 15 transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={15} />
    );
    expect(getByText('Outlaw')).toBeTruthy();
  });

  it('renders Sherwood Ranger tier for 31+ transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={35} />
    );
    expect(getByText('Sherwood Ranger')).toBeTruthy();
  });
});
