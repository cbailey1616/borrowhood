import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.confirmRentalPayment.mockResolvedValue({});
  api.getRentalPaymentStatus.mockResolvedValue({ status: 'authorized' });
});

describe('RentalCheckoutScreen', () => {
  const route = {
    params: {
      transactionId: 'txn-1', rentalFee: 1000, depositAmount: 2500, totalAmount: 3500,
      rentalDays: 7, listingTitle: 'Camera', lateFeePerDay: 500,
      clientSecret: 'pi_test_secret', ephemeralKey: 'ek_test', customerId: 'cus_test',
    },
  };

  it('renders price breakdown card', () => {
    const Screen = require('../../src/screens/RentalCheckoutScreen').default;
    const { getByTestId } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByTestId('RentalCheckout.card.priceBreakdown')).toBeTruthy();
  });

  it('renders authorize button', () => {
    const Screen = require('../../src/screens/RentalCheckoutScreen').default;
    const { getByTestId } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByTestId('RentalCheckout.button.authorize')).toBeTruthy();
  });

  it('displays listing title', () => {
    const Screen = require('../../src/screens/RentalCheckoutScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Camera')).toBeTruthy();
  });

  it('displays rental fee', () => {
    const Screen = require('../../src/screens/RentalCheckoutScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText(/7 days/)).toBeTruthy();
  });

  it('displays deposit amount', () => {
    const Screen = require('../../src/screens/RentalCheckoutScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText(/Security Deposit/)).toBeTruthy();
  });

  it('displays authorization hold total', () => {
    const Screen = require('../../src/screens/RentalCheckoutScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText(/Authorization Hold/)).toBeTruthy();
  });

  it('renders Rental Checkout title', () => {
    const Screen = require('../../src/screens/RentalCheckoutScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Rental Checkout')).toBeTruthy();
  });
});
