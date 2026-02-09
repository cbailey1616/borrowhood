import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockShowError = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: mockShowError, showToast: mockShowToast }),
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(),
  canGoBack: () => true,
};

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.forgotPassword.mockResolvedValue({ success: true });
    api.resetPassword.mockResolvedValue({ success: true });
  });

  it('renders email input (step 1)', () => {
    const ForgotPasswordScreen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const { getByPlaceholderText } = render(
      <ForgotPasswordScreen navigation={mockNavigation} />
    );
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
  });

  it('submit calls api.forgotPassword(email)', async () => {
    const ForgotPasswordScreen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <ForgotPasswordScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    await act(async () => {
      fireEvent.press(getByText('Send Reset Code'));
    });
    expect(api.forgotPassword).toHaveBeenCalledWith('test@test.com');
  });

  it('empty email shows validation error', async () => {
    const ForgotPasswordScreen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const { getByText } = render(
      <ForgotPasswordScreen navigation={mockNavigation} />
    );
    await act(async () => {
      fireEvent.press(getByText('Send Reset Code'));
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('success transitions to step 2 (reset code form)', async () => {
    const ForgotPasswordScreen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <ForgotPasswordScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    await act(async () => {
      fireEvent.press(getByText('Send Reset Code'));
    });
    // Step 2 should now be visible - code input has placeholder "123456"
    await waitFor(() => {
      expect(getByPlaceholderText('123456')).toBeTruthy();
    });
  });
});
