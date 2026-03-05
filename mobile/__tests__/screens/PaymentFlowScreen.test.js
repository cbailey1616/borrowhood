import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => jest.clearAllMocks());

describe('PaymentFlowScreen', () => {
  const route = {
    params: {
      amount: 2500,
      description: 'Test payment',
      metadata: {},
      onSuccess: jest.fn(),
      title: 'Pay Now',
    },
  };

  it('renders payment title', () => {
    const Screen = require('../../src/screens/PaymentFlowScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Pay Now')).toBeTruthy();
  });

  it('displays formatted amount', () => {
    const Screen = require('../../src/screens/PaymentFlowScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('$25.00')).toBeTruthy();
  });

  it('displays description', () => {
    const Screen = require('../../src/screens/PaymentFlowScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Test payment')).toBeTruthy();
  });

  it('shows pay button with amount', () => {
    const Screen = require('../../src/screens/PaymentFlowScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Pay $25.00')).toBeTruthy();
  });

  it('shows payment methods info', () => {
    const Screen = require('../../src/screens/PaymentFlowScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByText('Card, Apple Pay, or Google Pay')).toBeTruthy();
  });

  it('uses default title when not provided', () => {
    const routeNoTitle = { params: { amount: 1000 } };
    const Screen = require('../../src/screens/PaymentFlowScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={routeNoTitle} />);
    expect(getByText('Payment')).toBeTruthy();
  });
});
