import React from 'react';
import { render as nativeRender, fireEvent, waitFor, act } from '@testing-library/react-native';
const render = nativeRender;
import api from '../../../src/services/api';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import useBiometrics from '../../../src/hooks/useBiometrics';

const mockLogin = jest.fn().mockResolvedValue({ id: 'user-1' });
const mockGoogle = jest.fn();
const mockApple = jest.fn();
const mockCompleteLinkCode = jest.fn();
const mockShowError = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: mockLogin,
    loginWithGoogle: mockGoogle,
    loginWithApple: mockApple,
    completeSocialLinkCode: mockCompleteLinkCode,
  }),
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
  reset: jest.fn(),
  replace: jest.fn(),
  dispatch: jest.fn(),
  canGoBack: () => true,
};

describe('WelcomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBiometrics.mockReturnValue({ isBiometricsAvailable: false, isBiometricsEnabled: false });
  });

  it('connects Google with an email code without asking for or submitting a password', async () => {
    mockGoogle.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { code: 'ACCOUNT_LINK_REQUIRED', email: 'neighbor@example.com' }));
    api.startSocialLinkCode.mockResolvedValueOnce({ challengeId: 'challenge-1', email: 'neighbor@example.com' });
    mockCompleteLinkCode.mockResolvedValueOnce({});
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.google'));
    fireEvent.press(await screen.findByText('Email me a code'));
    await screen.findByTestId('Welcome.input.linkCode');
    expect(screen.queryByTestId('Welcome.input.password')).toBeNull();
    expect(api.startSocialLinkCode).toHaveBeenCalledWith('google', { idToken: 'mock-google-token' });
    fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '123456');
    await act(async () => fireEvent.press(screen.getByText('Verify & sign in')));
    expect(mockCompleteLinkCode).toHaveBeenCalledWith({ provider: 'google', token: { idToken: 'mock-google-token' }, email: 'neighbor@example.com' }, 'challenge-1', '123456');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('keeps reset available after a wrong Borrowhood password and prefills the account email', async () => {
    mockGoogle.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { code: 'ACCOUNT_LINK_REQUIRED', email: 'neighbor@example.com' }));
    mockLogin.mockRejectedValueOnce(new Error('Incorrect password.'));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.google'));
    fireEvent.press(await screen.findByText('Use password instead'));
    fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'wrong');
    fireEvent.press(screen.getByText('Connect & sign in'));
    await screen.findByText('Incorrect password.');
    fireEvent.press(screen.getByText('Forgot your password?'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ForgotPassword', { email: 'neighbor@example.com' });
    expect(screen.getByText('Use email code instead')).toBeTruthy();
  });

  it('shows a delivery error without pretending a code was sent', async () => {
    mockGoogle.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { code: 'ACCOUNT_LINK_REQUIRED' }));
    api.startSocialLinkCode.mockRejectedValueOnce(new Error('Could not send the code.'));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.google'));
    fireEvent.press(await screen.findByText('Email me a code'));
    await screen.findByText('Could not send the code.');
    expect(screen.queryByTestId('Welcome.input.linkCode')).toBeNull();
    expect(mockCompleteLinkCode).not.toHaveBeenCalled();
    expect(screen.queryByText('Forgot your password?')).toBeNull();
    expect(screen.getByText('Use password instead')).toBeTruthy();
  });

  it('shows email sign-in immediately and offers a separate account creation link', async () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    await screen.findByText('Sign in to your account');
    expect(screen.getByText('Create an account')).toBeTruthy();
    expect(screen.getByTestId('Welcome.input.email')).toBeTruthy();
    expect(screen.getByTestId('Welcome.input.password')).toBeTruthy();
    expect(screen.getByTestId('Auth.google')).toBeTruthy();
  });

  it('renders sign-in form', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('Enter your password')).toBeTruthy();
    expect(getByText('Sign in')).toBeTruthy();
  });

  it('email and password inputs accept text', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByPlaceholderText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'MyPass123');
  });

  it('Sign In button calls login()', async () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'MyPass123');
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'MyPass123');
  });

  it('login error shows inline error', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByPlaceholderText, getByText, findByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'wrong');
    await act(async () => {
      fireEvent.press(getByText('Sign in'));
    });
    expect(await findByText('Invalid credentials')).toBeTruthy();
  });

  it('renders forgot password link', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    expect(getByText('Forgot password?')).toBeTruthy();
  });

  it('forgot password navigates to ForgotPassword', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.press(getByText('Forgot password?'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ForgotPassword', { email: '' });
  });

  it('"Create one" link navigates to Register', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.press(getByText('Create an account'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Register');
  });

  it('removes an unfinished Apple connection when Google is cancelled', async () => {
    mockApple.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' }));
    GoogleSignin.signIn.mockResolvedValueOnce({ type: 'cancelled' });
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.apple'));
    await screen.findByText('Email me a code');
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign-in' }));
    await act(async () => fireEvent.press(screen.getByTestId('Auth.google')));
    expect(screen.queryByText('Connect Apple')).toBeNull();
    expect(screen.getByTestId('Welcome.input.password').props.value).toBe('');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('switches the linking explanation and submitted credential from Apple to Google', async () => {
    mockApple.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' }));
    mockGoogle.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' }));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.apple'));
    await screen.findByText('Email me a code');
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign-in' }));
    fireEvent.press(screen.getByTestId('Auth.google'));
    await screen.findByText('Connect Google');
    fireEvent.press(screen.getByText('Use password instead'));
    expect(screen.queryByText(/password once to connect Apple/)).toBeNull();
    expect(screen.getByText(/Enter your Borrowhood password to connect Google/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('Welcome.input.email'), 'test@test.com');
    fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'MyPass123');
    await act(async () => fireEvent.press(screen.getByText('Connect & sign in')));
    expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'MyPass123', { provider: 'google', token: { idToken: 'mock-google-token' } });
  });

  it('replaces provider choices and signup links with one focused account-linking step', async () => {
    mockGoogle.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { code: 'ACCOUNT_LINK_REQUIRED', email: 'neighbor@example.com' }));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.google'));
    await screen.findByText('Finish signing in');
    expect(screen.getByText('neighbor@example.com')).toBeTruthy();
    expect(screen.getByText("You already have a Borrowhood account. Confirm it's yours to use Google.")).toBeTruthy();
    expect(screen.queryByTestId('Auth.google')).toBeNull();
    expect(screen.queryByTestId('Auth.apple')).toBeNull();
    expect(screen.queryByText('Use Apple or Google instead')).toBeNull();
    expect(screen.queryByText('Forgot your password?')).toBeNull();
    expect(screen.queryByText('New here?')).toBeNull();
    expect(screen.queryByText('Create an account')).toBeNull();
    expect(api.startSocialLinkCode).not.toHaveBeenCalled();
  });

  it('submits from the password keyboard once even if Sign in is also tapped', async () => {
    let complete;
    mockLogin.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = render(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.changeText(screen.getByTestId('Welcome.input.email'), ' neighbor@example.com ');
    fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'MyPassword1');
    fireEvent(screen.getByTestId('Welcome.input.password'), 'submitEditing');
    fireEvent.press(screen.getByTestId('Welcome.button.signIn'));
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('neighbor@example.com', 'MyPassword1');
    expect(screen.getByTestId('Auth.google')).toBeDisabled();
    await act(async () => complete({ id: 'user-1' }));
  });

  it('blocks the visible password form while Google sign-in is pending', async () => {
    let complete;
    GoogleSignin.signIn.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = render(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.changeText(screen.getByTestId('Welcome.input.email'), 'neighbor@example.com');
    fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'MyPassword1');
    fireEvent.press(screen.getByTestId('Auth.google'));
    expect(screen.getByTestId('Welcome.button.signIn')).toBeDisabled();
    fireEvent(screen.getByTestId('Welcome.input.password'), 'submitEditing');
    expect(mockLogin).not.toHaveBeenCalled();
    await act(async () => complete({ type: 'cancelled' }));
    expect(screen.getByTestId('Welcome.button.signIn')).toBeEnabled();
  });

  it('keeps Face ID available to returning users and waits for biometric approval', async () => {
    const authenticate = jest.fn().mockResolvedValue(false);
    const getStoredCredentials = jest.fn().mockResolvedValue({ email: 'neighbor@example.com', password: 'saved-password' });
    useBiometrics.mockReturnValue({
      isBiometricsAvailable: true, isBiometricsEnabled: true, biometricType: 'Face ID', isLoading: false,
      hasStoredCredentials: jest.fn().mockResolvedValue(true), authenticate, getStoredCredentials,
    });
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = render(<WelcomeScreen navigation={mockNavigation} />);
    await screen.findByTestId('Welcome.button.biometric');
    await act(async () => fireEvent.press(screen.getByTestId('Welcome.button.biometric')));
    expect(getStoredCredentials).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
    authenticate.mockResolvedValueOnce(true);
    await act(async () => fireEvent.press(screen.getByTestId('Welcome.button.biometric')));
    expect(mockLogin).toHaveBeenCalledWith('neighbor@example.com', 'saved-password');
  });
});
