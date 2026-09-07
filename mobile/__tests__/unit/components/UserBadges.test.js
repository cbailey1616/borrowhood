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

  it('renders Outlaw tier for 100 transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={100} />
    );
    expect(getByText('Outlaw · About ranks')).toBeTruthy();
  });

  it('renders Sherwood Ranger tier for 250 transactions', () => {
    const UserBadges = require('../../../src/components/UserBadges').default;
    const { getByText } = render(
      <UserBadges isVerified={false} totalTransactions={250} />
    );
    expect(getByText('Sherwood Ranger · About ranks')).toBeTruthy();
  });
  it.each([[0, 'Squire'], [24, 'Squire'], [25, 'Archer'], [99, 'Archer'], [100, 'Outlaw'], [249, 'Outlaw'], [250, 'Sherwood Ranger'], [999, 'Sherwood Ranger'], [1000, 'Robin']])('assigns %i completed exchanges to %s', (count, expected) => {
    const { getTier } = require('../../../src/components/UserBadges');
    expect(getTier(count).label).toBe(expected);
  });
});
