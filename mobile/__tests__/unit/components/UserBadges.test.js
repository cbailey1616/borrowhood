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
    expect(getByText('Squire · About ranks')).toBeTruthy();
  });

  it('renders verified badge', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={true} totalTransactions={0} />
    );
    expect(getByText('Verified identity')).toBeTruthy();
  });

  it('renders Robin tier for 100 transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={100} />
    );
    expect(getByText('Robin · About ranks')).toBeTruthy();
  });

  it('renders Sherwood Ranger tier for 25 transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={25} />
    );
    expect(getByText('Sherwood Ranger · About ranks')).toBeTruthy();
  });
  it.each([[0, 'Squire'], [4, 'Squire'], [5, 'Archer'], [9, 'Archer'], [10, 'Outlaw'], [24, 'Outlaw'], [25, 'Sherwood Ranger'], [99, 'Sherwood Ranger'], [100, 'Robin'], [1000, 'Robin']])('assigns %i completed exchanges to %s', (count, expected) => {
    const { getTier } = require('../../../src/components/UserBadges');
    expect(getTier(count).label).toBe(expected);
  });
});
