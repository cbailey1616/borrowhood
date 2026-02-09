import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockLogin = jest.fn().mockResolvedValue({ id: 'user-1' });
const mockShowError = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: mockLogin,
    loginWithGoogle: jest.fn(),
    loginWithApple: jest.fn(),
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

  it('login error shows error via showError', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByPlaceholderText, getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Enter your password'), 'wrong');
    await act(async () => {
      fireEvent.press(getByText('Sign In'));
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('"Create one" link navigates to Register', () => {
    const WelcomeScreen = require('../../../src/screens/auth/WelcomeScreen').default;
    const { getByText } = render(
      <WelcomeScreen navigation={mockNavigation} />
    );
    fireEvent.press(getByText('Create one'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Register');
  });
});
