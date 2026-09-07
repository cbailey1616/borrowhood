import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import api from '../../../src/services/api';
const mockVerify = jest.fn();
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ verifySignupCode: mockVerify }) }));
import Screen from '../../../src/screens/auth/VerifySignupEmailScreen';
const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const route = { params: { email: 'new@example.test', challengeId: 'challenge-1', resendAfter: 60 } };
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); mockVerify.mockResolvedValue({}); api.resendSignupCode.mockResolvedValue({ resendAfter: 60 }); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('accepts pasted/autofilled codes and confirms only a complete code', async () => {
  const { getByLabelText, getByText } = render(<Screen route={route} navigation={navigation} />);
  expect(getByText('new@example.test')).toBeTruthy();
  fireEvent.press(getByLabelText('Verify email and continue'));
  expect(mockVerify).not.toHaveBeenCalled();
  fireEvent.changeText(getByLabelText('Six-digit email verification code'), '123 456');
  expect(getByLabelText('Six-digit email verification code').props.value).toBe('123456');
  await act(async () => fireEvent.press(getByLabelText('Verify email and continue')));
  expect(mockVerify).toHaveBeenCalledWith('challenge-1','123456');
});

it('shows an incorrect-code error and lets the user correct it', async () => {
  mockVerify.mockRejectedValueOnce(new Error('Incorrect code. Try again.'));
  const { getByLabelText, getByText, queryByText } = render(<Screen route={route} navigation={navigation} />);
  fireEvent.changeText(getByLabelText('Six-digit email verification code'), '000000');
  await act(async () => fireEvent.press(getByLabelText('Verify email and continue')));
  expect(getByText('Incorrect code. Try again.')).toBeTruthy();
  fireEvent.changeText(getByLabelText('Six-digit email verification code'), '123456');
  expect(queryByText('Incorrect code. Try again.')).toBeNull();
});

it('keeps resend disabled until its countdown ends and explains the replacement code', async () => {
  const { getByLabelText, getByText } = render(<Screen route={route} navigation={navigation} />);
  fireEvent.press(getByLabelText('Resend code'));
  expect(api.resendSignupCode).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(61000));
  await act(async () => fireEvent.press(getByLabelText('Resend code')));
  expect(api.resendSignupCode).toHaveBeenCalledWith('challenge-1');
  expect(getByText('A new code is on its way. Use the most recent email.')).toBeTruthy();
});

it('offers change email and sign in without requiring a code', () => {
  const { getByText } = render(<Screen route={route} navigation={navigation} />);
  fireEvent.press(getByText('Change email address'));
  expect(navigation.goBack).toHaveBeenCalled();
  fireEvent.press(getByText('Sign in instead'));
  expect(navigation.navigate).toHaveBeenCalledWith('Login');
});
