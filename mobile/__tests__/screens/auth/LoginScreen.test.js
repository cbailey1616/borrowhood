import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockLogin = jest.fn().mockResolvedValue({ id: 'user-1' });
const mockShowError = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: mockLogin,
  }),
}));

jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: mockShowError, showToast: jest.fn() }),
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

describe('LoginScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders email and password fields', () => {
    const LoginScreen = require('../../../src/screens/auth/LoginScreen').default;
    const { getByPlaceholderText } = render(
      <LoginScreen navigation={mockNavigation} />
    );
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('Enter your password')).toBeTruthy();
  });

  it('Sign In calls login()', async () => {
    const LoginScreen = require('../../../src/screens/auth/LoginScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'MyPassword1');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });
    expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'MyPassword1');
  });

  it('empty email shows validation error', async () => {
    const LoginScreen = require('../../../src/screens/auth/LoginScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'MyPassword1');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('empty password shows validation error', async () => {
    const LoginScreen = require('../../../src/screens/auth/LoginScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('wrong credentials show error', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    const LoginScreen = require('../../../src/screens/auth/LoginScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'wrong');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('renders forgot password link', () => {
    const LoginScreen = require('../../../src/screens/auth/LoginScreen').default;
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation} />
    );
    expect(getByText(/Forgot/i)).toBeTruthy();
  });
});
