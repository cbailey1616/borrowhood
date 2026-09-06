import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ModalHeader, ModalCloseButton } from '../../../src/components/ModalControls';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

describe('Modal controls', () => {
  const originalOS = Platform.OS;
  afterEach(() => { Platform.OS = originalOS; jest.clearAllMocks(); });

  it('shows only the themed close control and balances the title on iOS', () => {
    Platform.OS = 'ios';
    const { getByText, getByTestId, getByRole, queryByTestId } = render(<ModalHeader title="Edit Profile" />);
    expect(getByText('Edit Profile')).toBeTruthy();
    expect(queryByTestId('Modal.dragHandle')).toBeNull();
    const spacer = StyleSheet.flatten(getByTestId('Modal.headerSpacer').props.style);
    const close = StyleSheet.flatten(getByRole('button', { name: 'Close' }).props.style);
    expect(spacer.width).toBe(close.width);
    expect(close.width).toBe(44);
    expect(close.flexShrink).toBe(0);
  });

  it('does not suggest an iOS swipe gesture on Android', () => {
    Platform.OS = 'android';
    const { queryByTestId, getByRole } = render(<ModalHeader title="Edit Profile" />);
    expect(queryByTestId('Modal.dragHandle')).toBeNull();
    expect(getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('provides an accessible close button that goes back without saving', () => {
    const { getByRole } = render(<ModalCloseButton />);
    fireEvent.press(getByRole('button', { name: 'Close' }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
