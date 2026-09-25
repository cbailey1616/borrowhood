import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import SocialAccountLink from '../../../src/components/SocialAccountLink';
import api from '../../../src/services/api';

const mockComplete = jest.fn();
jest.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ completeSocialLinkCode: mockComplete }) }));
const link = { provider: 'google', token: { idToken: 'proof' }, email: 'neighbor@example.com' };
const navigation = { navigate: jest.fn() };
const onCancel = jest.fn();
const onPasswordSignIn = jest.fn();
const show = () => render(<SocialAccountLink link={link} navigation={navigation} onCancel={onCancel} onPasswordSignIn={onPasswordSignIn}/>);
const send = async screen => {
  fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
  await screen.findByTestId('Welcome.input.linkCode');
};

beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-25T21:37:00Z'));
  api.startSocialLinkCode.mockReset().mockResolvedValue({ challengeId: 'challenge', email: link.email });
  mockComplete.mockReset().mockResolvedValue({});
  onPasswordSignIn.mockReset().mockResolvedValue({});
});
afterEach(() => jest.useRealTimers());

it('waits for all six digits and accepts pasted or autofilled codes', async () => {
  const screen = show(); await send(screen);
  const confirm = screen.getByRole('button', { name: 'Verify code and sign in' });
  expect(confirm).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '12');
  fireEvent.press(confirm);
  expect(mockComplete).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '123 456');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify code and sign in' })));
  expect(mockComplete).toHaveBeenCalledWith(link, 'challenge', '123456');
  expect(onPasswordSignIn).not.toHaveBeenCalled();
});

it('prevents duplicate sends and leaving while the request is in flight', async () => {
  let resolve; api.startSocialLinkCode.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const screen = show();
  const sendButton = screen.getByRole('button', { name: 'Email me a code' });
  fireEvent.press(sendButton); fireEvent.press(sendButton);
  expect(api.startSocialLinkCode).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Back to sign-in' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Use password instead' })).toBeDisabled();
  await act(async () => resolve({ challengeId: 'challenge', email: link.email }));
});

it('allows one verification at a time and keeps invalid-code errors editable', async () => {
  let reject; mockComplete.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const screen = show(); await send(screen);
  fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '123456');
  const confirm = screen.getByRole('button', { name: 'Verify code and sign in' });
  fireEvent.press(confirm); fireEvent.press(confirm);
  expect(mockComplete).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('Incorrect code. Check your email and try again.')));
  expect(screen.getByRole('alert')).toHaveTextContent('Incorrect code. Check your email and try again.');
  expect(screen.getByTestId('Welcome.input.linkCode').props.editable).toBe(true);
  fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '654321');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify code and sign in' })));
  expect(mockComplete).toHaveBeenLastCalledWith(link, 'challenge', '654321');
});

it('resends after the server cooldown and replaces both the challenge and entered code', async () => {
  const screen = show(); await send(screen);
  fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '111111');
  expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();
  expect(screen.getByText('Resend code in 60s')).toBeTruthy();
  act(() => jest.advanceTimersByTime(60000));
  api.startSocialLinkCode.mockResolvedValueOnce({ challengeId: 'new-challenge', email: link.email });
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Resend code' })));
  expect(screen.getByTestId('Welcome.input.linkCode').props.value).toBe('');
  expect(screen.getByText('A new code was sent. Use the latest email.')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '654321');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify code and sign in' })));
  expect(mockComplete).toHaveBeenCalledWith(link, 'new-challenge', '654321');
});

it('honors a rate limit before the first code without claiming delivery', async () => {
  api.startSocialLinkCode.mockRejectedValueOnce(Object.assign(new Error('Please wait a minute before requesting another code.'), { status: 429 }));
  const screen = show();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Email me a code' })));
  expect(screen.queryByText('Code sent to')).toBeNull();
  expect(screen.queryByTestId('Welcome.input.linkCode')).toBeNull();
  expect(screen.getByRole('button', { name: 'Send code in 60s' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Use password instead' })).not.toBeDisabled();
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.getByRole('button', { name: 'Email me a code' })).not.toBeDisabled();
});

it('does not offer an invalidated old code after resend delivery fails', async () => {
  const screen = show(); await send(screen);
  act(() => jest.advanceTimersByTime(60000));
  api.startSocialLinkCode.mockRejectedValueOnce(Object.assign(new Error('Could not send the code.'), { status: 503 }));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Resend code' })));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not send the code.');
  expect(screen.queryByTestId('Welcome.input.linkCode')).toBeNull();
  expect(screen.queryByText('Code sent to')).toBeNull();
  expect(screen.getByRole('button', { name: 'Email me a code' })).toBeTruthy();
});

it('preserves an existing challenge when a resend is only rate limited', async () => {
  const screen = show(); await send(screen);
  act(() => jest.advanceTimersByTime(60000));
  api.startSocialLinkCode.mockRejectedValueOnce(Object.assign(new Error('Please wait a minute.'), { status: 429 }));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Resend code' })));
  fireEvent.changeText(screen.getByTestId('Welcome.input.linkCode'), '123456');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Verify code and sign in' })));
  expect(mockComplete).toHaveBeenCalledWith(link, 'challenge', '123456');
});

it('does not enter verification when the server did not provide a challenge', async () => {
  api.startSocialLinkCode.mockResolvedValueOnce({ email: link.email });
  const screen = show();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Email me a code' })));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not send a code. Please try again.');
  expect(screen.queryByText('Code sent to')).toBeNull();
});

it('keeps email verification tied to the provider even after editing the password-login email', async () => {
  const screen = show();
  fireEvent.press(screen.getByRole('button', { name: 'Use password instead' }));
  fireEvent.changeText(screen.getByTestId('Welcome.input.email'), 'other@example.com');
  fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'Secret');
  fireEvent.press(screen.getByRole('button', { name: 'Use email code instead' }));
  await send(screen);
  expect(api.startSocialLinkCode).toHaveBeenCalledWith('google', link.token);
  expect(screen.getByText(link.email)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Use password instead' }));
  expect(screen.getByTestId('Welcome.input.password').props.value).toBe('');
});

it('submits the password and selected provider together only after valid input', async () => {
  const screen = show();
  fireEvent.press(screen.getByRole('button', { name: 'Use password instead' }));
  fireEvent.press(screen.getByRole('button', { name: 'Connect Google and sign in' }));
  expect(onPasswordSignIn).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId('Welcome.input.password'), 'MyBorrowhoodPassword');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Connect Google and sign in' })));
  expect(onPasswordSignIn).toHaveBeenCalledWith(link.email, 'MyBorrowhoodPassword', link);
});

it('does not complete verification or change the flow after an unmounted send resolves', async () => {
  let resolve; api.startSocialLinkCode.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const screen = show();
  fireEvent.press(screen.getByRole('button', { name: 'Email me a code' }));
  screen.unmount();
  await act(async () => resolve({ challengeId: 'challenge', email: link.email }));
  expect(mockComplete).not.toHaveBeenCalled();
  expect(onPasswordSignIn).not.toHaveBeenCalled();
});
