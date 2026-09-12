import React from 'react';
import { render } from '@testing-library/react-native';
import UserBadges from '../../../src/components/UserBadges';

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

it('shows verification and completed exchanges without an activity rank', () => {
  const screen = render(<UserBadges isVerified totalTransactions={100} />);
  expect(screen.getByText('Verified identity')).toBeTruthy();
  expect(screen.getByText('100 completed exchanges')).toBeTruthy();
  expect(screen.queryByLabelText('View community ranks')).toBeNull();
});

it('uses the same exchange count in the account summary', () => {
  const screen = render(<UserBadges layout="summary" totalTransactions={1} />);
  expect(screen.getByLabelText('1 completed exchange')).toBeTruthy();
  expect(screen.queryByText(/rank|endorsed/i)).toBeNull();
});
