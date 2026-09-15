import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';
import { TextInput } from 'react-native';
import { UNSTABLE_usePreventRemove as usePreventRemove } from '@react-navigation/native';

const mockShowError = jest.fn();
const mockShowToast = jest.fn();
const mockChangePassword = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, changePassword: mockChangePassword }),
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
  it.each(['GO_BACK', 'POP'])('returns one reset step for native %s', async type => {
    const Screen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await act(async () => fireEvent.press(screen.getByText('Send Reset Code')));
    const [prevented, handleRemoval] = usePreventRemove.mock.calls.at(-1);
    expect(prevented).toBe(true);
    act(() => handleRemoval({ data: { action: { type } } }));
    expect(screen.getByText('Send Reset Code')).toBeTruthy();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
  });

  it('releases the step guard before returning to login after a successful reset', async () => {
    api.verifyResetCode = jest.fn().mockResolvedValue({ resetToken: 'reset-token' });
    const Screen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await act(async () => fireEvent.press(screen.getByText('Send Reset Code')));
    await act(async () => fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], '123456'));
    fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'newpassword123');
    fireEvent.changeText(screen.getByPlaceholderText('Re-enter your password'), 'newpassword123');
    await act(async () => fireEvent.press(screen.getByText('Reset Password')));
    expect(api.resetPassword).toHaveBeenCalledWith('reset-token', 'newpassword123');
    expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login');
  });

  it('ignores a verification response after going back to the email step', async () => {
    let resolveCode;
    api.verifyResetCode = jest.fn(() => new Promise(resolve => { resolveCode = resolve; }));
    const Screen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await act(async () => fireEvent.press(screen.getByText('Send Reset Code')));
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], '123456');
    const [, handleRemoval] = usePreventRemove.mock.calls.at(-1);
    act(() => handleRemoval({ data: { action: { type: 'GO_BACK' } } }));
    await act(async () => resolveCode({ resetToken: 'late-token' }));
    expect(screen.getByText('Send Reset Code')).toBeTruthy();
    expect(screen.queryByText('Set new password')).toBeNull();
  });

  it('changes a signed-in password using current and new passwords without emailing a code', async () => {
    mockChangePassword.mockResolvedValueOnce({});
    const Screen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { changeMode: true, email: 'test@example.com' } }} />);
    fireEvent.changeText(screen.getByPlaceholderText('Enter current password'), 'current123');
    fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'newpassword123');
    fireEvent.changeText(screen.getByPlaceholderText('Re-enter your password'), 'newpassword123');
    await act(async () => fireEvent.press(screen.getByText('Change Password')));
    expect(mockChangePassword).toHaveBeenCalledWith('current123', 'newpassword123');
    expect(api.forgotPassword).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('keeps the change form open when the current password is incorrect', async () => {
    mockChangePassword.mockRejectedValueOnce(new Error('Current password is incorrect.'));
    const Screen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { changeMode: true } }} />);
    fireEvent.changeText(screen.getByPlaceholderText('Enter current password'), 'wrong');
    fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'newpassword123');
    fireEvent.changeText(screen.getByPlaceholderText('Re-enter your password'), 'newpassword123');
    await act(async () => fireEvent.press(screen.getByText('Change Password')));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Current password is incorrect.' }));
  });
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

  it('success transitions to step 2 (code entry)', async () => {
    const ForgotPasswordScreen = require('../../../src/screens/auth/ForgotPasswordScreen').default;
    const { getByPlaceholderText, getByText, findByText } = render(
      <ForgotPasswordScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    await act(async () => {
      fireEvent.press(getByText('Send Reset Code'));
    });
    // Step 2 shows "Enter your code" title and resend button
    await waitFor(() => {
      expect(getByText('Enter your code')).toBeTruthy();
    });
    expect(getByText(/Resend code/)).toBeTruthy();
  });
});
