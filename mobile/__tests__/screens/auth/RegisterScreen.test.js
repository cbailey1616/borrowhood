import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockRegister = jest.fn().mockResolvedValue({
  user: { id: 'user-1' },
  accessToken: 'token',
  refreshToken: 'refresh',
});
const mockShowError = jest.fn();

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    register: mockRegister,
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

describe('RegisterScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all input fields', () => {
    const RegisterScreen = require('../../../src/screens/auth/RegisterScreen').default;
    const { getByTestId } = render(
      <RegisterScreen navigation={mockNavigation} />
    );
    expect(getByTestId('Register.input.firstName')).toBeTruthy();
    expect(getByTestId('Register.input.lastName')).toBeTruthy();
    expect(getByTestId('Register.input.email')).toBeTruthy();
    expect(getByTestId('Register.input.password')).toBeTruthy();
    expect(getByTestId('Register.input.confirmPassword')).toBeTruthy();
  });

  it('Create Account button calls register()', async () => {
    const RegisterScreen = require('../../../src/screens/auth/RegisterScreen').default;
    const { getByTestId, getByText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByTestId('Register.input.firstName'), 'Jane');
    fireEvent.changeText(getByTestId('Register.input.lastName'), 'Doe');
    fireEvent.changeText(getByTestId('Register.input.email'), 'jane@test.com');
    fireEvent.changeText(getByTestId('Register.input.password'), 'SecurePass123');
    fireEvent.changeText(getByTestId('Register.input.confirmPassword'), 'SecurePass123');
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.com',
        password: 'SecurePass123',
      })
    );
  });

  it('validates required fields', async () => {
    const RegisterScreen = require('../../../src/screens/auth/RegisterScreen').default;
    const { getByText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });
    expect(mockShowError).toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('validates password length (min 8)', async () => {
    const RegisterScreen = require('../../../src/screens/auth/RegisterScreen').default;
    const { getByTestId, getByText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByTestId('Register.input.firstName'), 'Jane');
    fireEvent.changeText(getByTestId('Register.input.lastName'), 'Doe');
    fireEvent.changeText(getByTestId('Register.input.email'), 'jane@test.com');
    fireEvent.changeText(getByTestId('Register.input.password'), 'Short1');
    fireEvent.changeText(getByTestId('Register.input.confirmPassword'), 'Short1');
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });
    expect(mockShowError).toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('validates password match', async () => {
    const RegisterScreen = require('../../../src/screens/auth/RegisterScreen').default;
    const { getByTestId, getByText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByTestId('Register.input.firstName'), 'Jane');
    fireEvent.changeText(getByTestId('Register.input.lastName'), 'Doe');
    fireEvent.changeText(getByTestId('Register.input.email'), 'jane@test.com');
    fireEvent.changeText(getByTestId('Register.input.password'), 'SecurePass123');
    fireEvent.changeText(getByTestId('Register.input.confirmPassword'), 'DifferentPass');
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });
    expect(mockShowError).toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('error during registration displays via showError', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Email already exists'));
    const RegisterScreen = require('../../../src/screens/auth/RegisterScreen').default;
    const { getByTestId, getByText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );
    fireEvent.changeText(getByTestId('Register.input.firstName'), 'Jane');
    fireEvent.changeText(getByTestId('Register.input.lastName'), 'Doe');
    fireEvent.changeText(getByTestId('Register.input.email'), 'jane@test.com');
    fireEvent.changeText(getByTestId('Register.input.password'), 'SecurePass123');
    fireEvent.changeText(getByTestId('Register.input.confirmPassword'), 'SecurePass123');
    await act(async () => {
      fireEvent.press(getByText('Create Account'));
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it('navigates to login from sign-in link', () => {
    const RegisterScreen = require('../../../src/screens/auth/RegisterScreen').default;
    const { getByText } = render(
      <RegisterScreen navigation={mockNavigation} />
    );
    const signInLink = getByText('Sign in');
    fireEvent.press(signInLink);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login');
  });
});
