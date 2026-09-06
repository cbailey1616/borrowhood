import React from 'react';
import { Modal } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import VerifiedBadge from '../../../src/components/VerifiedBadge';

const mockNavigate = jest.fn();
let mockVerified = false;
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { isVerified: mockVerified } }) }));
beforeEach(() => { mockVerified = false; mockNavigate.mockClear(); });

it('explains verification and invites an unverified viewer without opening the card', () => {
  const { getByLabelText, getByText, UNSAFE_getByType } = render(<VerifiedBadge interactive />);
  const stopPropagation = jest.fn();
  fireEvent.press(getByLabelText('Verified identity'), { stopPropagation });
  expect(stopPropagation).toHaveBeenCalled();
  expect(getByText(/This person’s identity has been verified/)).toBeTruthy();
  fireEvent.press(getByText('Build town trust · Get verified'));
  fireEvent(UNSAFE_getByType(Modal), 'dismiss');
  expect(mockNavigate).toHaveBeenCalledWith('IdentityVerification', { source: 'identity_badge' });
});

it('does not ask an already verified viewer to verify again', () => {
  mockVerified = true;
  const { getByLabelText, queryByText, getByText } = render(<VerifiedBadge interactive />);
  fireEvent.press(getByLabelText('Verified identity'));
  expect(getByText('A little extra peace of mind')).toBeTruthy();
  expect(queryByText('Build town trust · Get verified')).toBeNull();
});
