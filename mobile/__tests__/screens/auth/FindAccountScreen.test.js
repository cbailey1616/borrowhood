import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => jest.clearAllMocks());

describe('FindAccountScreen', () => {
  it('renders choose step initially', () => {
    const Screen = require('../../../src/screens/auth/FindAccountScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    expect(getByText('Find your account')).toBeTruthy();
    expect(getByText('Search by phone number')).toBeTruthy();
    expect(getByText('Search by name')).toBeTruthy();
  });

  it('navigates to phone step on tap', () => {
    const Screen = require('../../../src/screens/auth/FindAccountScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(getByText('Search by phone number'));
    expect(getByText('Phone number')).toBeTruthy();
  });

  it('navigates to name step on tap', () => {
    const Screen = require('../../../src/screens/auth/FindAccountScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(getByText('Search by name'));
    expect(getByText('First name')).toBeTruthy();
    expect(getByText('Last name')).toBeTruthy();
  });

  it('shows validation error for empty phone', async () => {
    const Screen = require('../../../src/screens/auth/FindAccountScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(getByText('Search by phone number'));
    await act(async () => { fireEvent.press(getByText('Search')); });
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ type: 'validation' }));
  });

  it('shows success state after successful search', async () => {
    api.findAccount.mockResolvedValue({});
    const Screen = require('../../../src/screens/auth/FindAccountScreen').default;
    const { getByText, getByPlaceholderText, findByText } = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(getByText('Search by phone number'));
    fireEvent.changeText(getByPlaceholderText('(555) 123-4567'), '5551234567');
    await act(async () => { fireEvent.press(getByText('Search')); });
    await findByText('Check your inbox');
  });

  it('back button on choose step goes back', () => {
    const Screen = require('../../../src/screens/auth/FindAccountScreen').default;
    const { UNSAFE_root } = render(<Screen navigation={mockNavigation} />);
    // The first HapticPressable is the back button
    const backBtn = UNSAFE_root.findAll(n => n.props.onPress)?.[0];
    if (backBtn) fireEvent.press(backBtn);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
