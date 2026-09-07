import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5 };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, isFocused: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.createTransaction.mockResolvedValue({ id: 'txn-1' });
  api.checkSubscriptionAccess.mockResolvedValue({ canAccess: true, nextStep: null });
});

describe('BorrowRequestScreen', () => {
  const listing = { id: 'listing-1', title: 'Camera', photos: ['https://test.com/photo.jpg'], isFree: true, pricePerDay: 0, depositAmount: 0, minDuration: 1, maxDuration: 14, visibility: 'close_friends', owner: { id: 'user-2', firstName: 'Bob', lastName: 'Smith' } };
  const route = { params: { listing } };

  it('displays listing info from route.params', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const { findByText } = render(<BorrowRequestScreen navigation={mockNavigation} route={route} />);
    await findByText('Camera');
  });

  it('message input accepts text', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const { findByPlaceholderText } = render(<BorrowRequestScreen navigation={mockNavigation} route={route} />);
    const input = await findByPlaceholderText(/Introduce yourself/);
    fireEvent.changeText(input, 'Need it for a trip!');
  });

  it('send request calls api.createTransaction', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const { findByPlaceholderText, getByText } = render(<BorrowRequestScreen navigation={mockNavigation} route={route} />);
    const input = await findByPlaceholderText(/Introduce yourself/);
    fireEvent.changeText(input, 'Need it for a trip!');
    await act(async () => { fireEvent.press(getByText('Send Request')); });
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1' }));
  });

  it('dismisses the keyboard without losing the private request message', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const input = await screen.findByLabelText('Private message to owner');
    fireEvent.changeText(input, 'Tomorrow afternoon?');
    fireEvent.press(screen.getByLabelText('Dismiss keyboard'));
    expect(dismiss).toHaveBeenCalled();
    expect(input.props.value).toBe('Tomorrow afternoon?');
    await act(async () => fireEvent.press(screen.getByText('Send Request')));
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ message: 'Tomorrow afternoon?' }));
    dismiss.mockRestore();
  });

  it('includes the displayed sale price with a purchase request', async () => {
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const sale = { ...listing, listingType: 'giveaway', directFee: { amount: 25, unit: 'flat' } };
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listing: sale } }} />);
    await screen.findByText('$25.00');
    await act(async () => fireEvent.press(screen.getByText('Request to Buy')));
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1', salePrice: 25 }));
  });

  it('submits without message (message is optional)', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const { findByText, getByText } = render(<BorrowRequestScreen navigation={mockNavigation} route={route} />);
    await findByText('Camera');
    await act(async () => { fireEvent.press(getByText('Send Request')); });
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1' }));
  });
});
