import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, reset: jest.fn() };
const mockRefreshUser = jest.fn();
const mockShowError = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: mockRefreshUser }) }));
jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: mockShowToast }) }));

beforeEach(() => jest.clearAllMocks());

describe('VerifyIdentityScreen', () => {
  const route = { params: {} };

  it('renders verify screen with title', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Verify Your Identity')).toBeTruthy();
  });

  it('displays benefit items', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Your data is encrypted and secure')).toBeTruthy();
    expect(getByText('Build trust with your neighbors')).toBeTruthy();
    expect(getByText('Required to borrow or lend items')).toBeTruthy();
  });

  it('has verify with ID button', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Verify with ID')).toBeTruthy();
  });

  it('has already verified button', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText("I've already verified")).toBeTruthy();
  });

  it('has skip for now button', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Skip for now')).toBeTruthy();
  });

  it('skip button shows ActionSheet confirmation', () => {
    const Screen = require('../../../src/screens/auth/VerifyIdentityScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(getByText('Skip for now'));
    expect(getByText('Skip Verification?')).toBeTruthy();
  });
});
