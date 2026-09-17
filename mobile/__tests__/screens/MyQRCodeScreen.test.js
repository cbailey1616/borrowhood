import React from 'react';
import { Share, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import MyQRCodeScreen from '../../src/screens/MyQRCodeScreen';
import { createProfileLink } from '../../src/utils/profileLinks';
import { profileQrSource } from '../../src/utils/profileQr';

const mockUser = { id: '10000000-0000-4000-8000-000000000001', displayName: 'Chris', firstName: 'Christopher', lastName: 'Bailey' };
const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError }) }));
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' }); });
afterEach(() => { jest.restoreAllMocks(); });

it('shows the current member’s code and opens the share sheet only after a tap', async () => {
  const screen = render(<MyQRCodeScreen />);
  expect(screen.getByText('Chris')).toBeTruthy();
  expect(screen.queryByText('Christopher Bailey')).toBeNull();
  const source = screen.getByTestId('MyQRCode.code').props.source;
  const uri = (Array.isArray(source) ? source[0] : source).uri;
  expect(uri === profileQrSource(createProfileLink(mockUser.id)).uri).toBe(true);
  expect(Share.share).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByLabelText('Share profile')));
  expect(Share.share).toHaveBeenCalledWith(Platform.OS === 'ios'
    ? { message: 'Add me on Borrowhood.', url: createProfileLink(mockUser.id) }
    : { message: `Add me on Borrowhood.\n${createProfileLink(mockUser.id)}` });
});

it('keeps sharing available after an error', async () => {
  Share.share.mockRejectedValueOnce(new Error('unavailable'));
  const screen = render(<MyQRCodeScreen />);
  await act(async () => fireEvent.press(screen.getByLabelText('Share profile')));
  expect(mockShowError).toHaveBeenCalledWith('Could not share your profile', 'Please try again.');
  expect(screen.getByLabelText('Share profile').props.accessibilityState.disabled).toBe(false);
});
