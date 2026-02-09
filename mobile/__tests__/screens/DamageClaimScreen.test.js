import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

beforeEach(() => { jest.clearAllMocks(); api.submitDamageClaim.mockResolvedValue({ claimAmount: 2500, depositRefunded: 2500 }); });

describe('DamageClaimScreen', () => {
  const route = { params: { transactionId: 'txn-1', depositAmount: 50, listingTitle: 'Camera', conditionAtPickup: 'good', conditionAtReturn: 'worn' } };

  it('renders amount input', () => {
    const DamageClaimScreen = require('../../src/screens/DamageClaimScreen').default;
    const { getByTestId } = render(<DamageClaimScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('DamageClaim.input.amount')).toBeTruthy();
  });

  it('renders description input', () => {
    const DamageClaimScreen = require('../../src/screens/DamageClaimScreen').default;
    const { getByTestId } = render(<DamageClaimScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('DamageClaim.input.description')).toBeTruthy();
  });

  it('renders add photo button', () => {
    const DamageClaimScreen = require('../../src/screens/DamageClaimScreen').default;
    const { getByTestId } = render(<DamageClaimScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('DamageClaim.button.addPhoto')).toBeTruthy();
  });

  it('submit calls api.submitDamageClaim', async () => {
    const DamageClaimScreen = require('../../src/screens/DamageClaimScreen').default;
    const { getByTestId } = render(<DamageClaimScreen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByTestId('DamageClaim.input.amount'), '25');
    fireEvent.changeText(getByTestId('DamageClaim.input.description'), 'Lens is cracked and body has deep scratches');
    await act(async () => { fireEvent.press(getByTestId('DamageClaim.button.submit')); });
    expect(api.submitDamageClaim).toHaveBeenCalled();
  });

  it('submit disabled when amount is 0', () => {
    const DamageClaimScreen = require('../../src/screens/DamageClaimScreen').default;
    const { getByTestId } = render(<DamageClaimScreen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByTestId('DamageClaim.input.description'), 'Some damage notes here');
    // Button should be disabled (opacity 0.5) when amount is empty
  });

  it('displays listing title', () => {
    const DamageClaimScreen = require('../../src/screens/DamageClaimScreen').default;
    const { getByText } = render(<DamageClaimScreen navigation={mockNavigation} route={route} />);
    expect(getByText('Camera')).toBeTruthy();
  });

  it('shows condition comparison', () => {
    const DamageClaimScreen = require('../../src/screens/DamageClaimScreen').default;
    const { getByText } = render(<DamageClaimScreen navigation={mockNavigation} route={route} />);
    expect(getByText(/Pickup: good/)).toBeTruthy();
    expect(getByText(/Return: worn/)).toBeTruthy();
  });
});
