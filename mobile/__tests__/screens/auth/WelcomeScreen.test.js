import React from 'react';
import { render as nativeRender, fireEvent, waitFor, act } from '@testing-library/react-native';
const render = element => { const screen = nativeRender(element); fireEvent.press(screen.getByText('Sign in with email')); return screen; };
import api from '../../../src/services/api';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const mockLogin = jest.fn().mockResolvedValue({ id: 'user-1' });
const mockGoogle = jest.fn();
const mockApple = jest.fn();
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
  beforeEach(() => jest.clearAllMocks());

  it('distinguishes joining from signing in before showing password fields', async () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    await screen.findByText('Sign up or sign in');
    expect(screen.getByText('Create an account with email')).toBeTruthy();
    expect(screen.queryByTestId('Welcome.input.password')).toBeNull();
    fireEvent.press(screen.getByText('Sign in with email'));
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByTestId('Welcome.input.password')).toBeTruthy();
    fireEvent.press(screen.getByText('Use Apple or Google instead'));
    expect(screen.getByText('Sign up or sign in')).toBeTruthy();
    expect(screen.queryByTestId('Welcome.input.password')).toBeNull();
  });

  it('renders sign-in form', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('Enter your password')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();
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
      fireEvent.press(getByText('Sign In'));
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
      fireEvent.press(getByText('Sign In'));
    });
    expect(await findByText('Invalid credentials')).toBeTruthy();
  });

  it('renders forgot password link', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    expect(getByText('Forgot your password?')).toBeTruthy();
  });

  it('forgot password navigates to ForgotPassword', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.press(getByText('Forgot your password?'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ForgotPassword');
  });

  it('"Create one" link navigates to Register', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.press(getByText('Create an account with email'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Register');
  });

  it('removes an unfinished Apple connection when Google is cancelled', async () => {
    mockApple.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' }));
    GoogleSignin.signIn.mockResolvedValueOnce({ type: 'cancelled' });
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.apple'));
    await screen.findByText('Connect Apple & sign in');
    await act(async () => fireEvent.press(screen.getByTestId('Auth.google')));
    expect(screen.queryByText('Connect Apple & sign in')).toBeNull();
    expect(screen.queryByTestId('Welcome.input.password')).toBeNull();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('switches the linking explanation and submitted credential from Apple to Google', async () => {
    mockApple.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' }));
    mockGoogle.mockRejectedValueOnce(Object.assign(new Error('Connect account'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' }));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const screen = nativeRender(<WelcomeScreen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByTestId('Auth.apple'));
    await screen.findByText('Connect Apple & sign in');
    fireEvent.press(screen.getByTestId('Auth.google'));
    await screen.findByText('Connect Google & sign in');
    expect(screen.queryByText(/password once to connect Apple/)).toBeNull();
    expect(screen.getByText(/Borrowhood password once to connect Google/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('Welcome.input.email'), 'test@test.com');
    fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'MyPass123');
    await act(async () => fireEvent.press(screen.getByText('Connect Google & sign in')));
    expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'MyPass123', { provider: 'google', token: { idToken: 'mock-google-token' } });
  });
});
