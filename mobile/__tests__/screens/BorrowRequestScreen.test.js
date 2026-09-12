import React from 'react';
import { Keyboard, ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null, onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5 };
const mockNavigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, isFocused: () => true };
const mockShowError = jest.fn();
let mockPaidTiers = false;

jest.mock('../../src/utils/config', () => Object.defineProperty(
  { ...jest.requireActual('../../src/utils/config'), __esModule: true },
  'ENABLE_PAID_TIERS', { get: () => mockPaidTiers },
));

jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 88 }));

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.isVerified = true;
  mockPaidTiers = false;
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

  it('bounds a one-day loan and clamps an out-of-range end date', async () => {
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listing: { ...listing, minDuration: 1, maxDuration: 1 } } }} />);
    fireEvent.press(await screen.findByText('End Date'));
    const picker = screen.UNSAFE_getByType('DateTimePicker');
    expect(picker.props.minimumDate.getTime()).toBe(picker.props.maximumDate.getTime());
    const invalid = new Date(picker.props.value);
    invalid.setFullYear(invalid.getFullYear() + 1);
    fireEvent(picker, 'change', { type: 'set' }, invalid);
    expect(screen.UNSAFE_getByType('DateTimePicker').props.value.getTime()).toBe(picker.props.maximumDate.getTime());
    await act(async () => fireEvent.press(screen.getByText('Send Request')));
    const request = api.createTransaction.mock.calls[0][0];
    expect(Math.round((new Date(request.endDate) - new Date(request.startDate)) / 86400000)).toBe(1);
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
    expect(mockNavigation.replace).toHaveBeenCalledWith('TransactionDetail', { id: 'txn-1' });
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('sends the typed message while the keyboard is open', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const input = await screen.findByLabelText('Private message to owner');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'Tomorrow afternoon?');
    expect(screen.queryByLabelText('Done, close keyboard')).toBeNull();
    expect(input.props.keyboardAppearance).toBe('dark');
    expect(input.props.inputAccessoryViewID).toBeUndefined();
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.keyboardDismissMode).toBe('interactive');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(input.props.value).toBe('Tomorrow afternoon?');
    await act(async () => fireEvent.press(screen.getByText('Send Request')));
    expect(dismiss).toHaveBeenCalled();
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ message: 'Tomorrow afternoon?' }));
    dismiss.mockRestore();
  });

  it('dismisses typing before date selection and closes dates when typing resumes', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const endDate = await screen.findByText('End Date');
    fireEvent.press(endDate);
    expect(dismiss).toHaveBeenCalled();
    expect(screen.UNSAFE_getByType(DateTimePicker)).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    const input = screen.getByLabelText('Private message to owner');
    fireEvent(input, 'focus');
    expect(screen.UNSAFE_queryByType(DateTimePicker)).toBeNull();
    expect(screen.queryByLabelText('Done, close keyboard')).toBeNull();
    expect(input.props.keyboardAppearance).toBe('dark');
    fireEvent.changeText(input, 'Tomorrow afternoon?');
    expect(input.props.value).toBe('Tomorrow afternoon?');
    dismiss.mockRestore();
  });

  it('includes the displayed sale price with a purchase request', async () => {
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const sale = { ...listing, listingType: 'sell', directFee: { amount: 25, unit: 'flat' } };
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listing: sale } }} />);
    await screen.findByText('$25.00');
    await act(async () => fireEvent.press(screen.getByText('Request to Buy')));
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1', salePrice: 25 }));
    expect(mockNavigation.replace).toHaveBeenCalledWith('TransactionDetail', { id: 'txn-1' });
  });

  it.each([
    ['sell', 'Request to Buy'],
    ['giveaway', 'Request Item'],
  ])('lets an unverified neighbor request an accessible Town %s', async (listingType, button) => {
    mockUser.isVerified = false;
    // This old endpoint rejects all Town activity, even permitted transfers.
    api.checkSubscriptionAccess.mockResolvedValue({ canAccess: false, requiredTier: 'plus' });
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const townItem = { ...listing, listingType, visibility: 'town',
      ...(listingType === 'sell' ? { directFee: { amount: 25, unit: 'flat' } } : {}),
    };
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listing: townItem } }} />);
    const submit = await screen.findByText(button);
    expect(screen.queryByText('Verify to Unlock')).toBeNull();
    await act(async () => fireEvent.press(submit));
    expect(api.checkSubscriptionAccess).not.toHaveBeenCalled();
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: listing.id }));
    expect(api.createTransaction.mock.calls[0][0]).not.toHaveProperty('startDate');
    expect(mockNavigation.replace).toHaveBeenCalledWith('TransactionDetail', { id: 'txn-1' });
  });

  it.each(['close_friends', 'neighborhood'])('keeps %s borrowing available without ID verification', async visibility => {
    mockUser.isVerified = false;
    api.checkSubscriptionAccess.mockResolvedValue({ canAccess: false, requiredTier: 'plus' });
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listing: { ...listing, visibility } } }} />);
    const submit = await screen.findByText('Send Request');
    await act(async () => fireEvent.press(submit));
    expect(api.checkSubscriptionAccess).not.toHaveBeenCalled();
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      listingId: listing.id, startDate: expect.any(String), endDate: expect.any(String),
    }));
    expect(mockNavigation.replace).toHaveBeenCalledWith('TransactionDetail', { id: 'txn-1' });
  });

  it('does not treat an unverified Town borrow request as successful when the server denies access', async () => {
    mockUser.isVerified = false;
    api.createTransaction.mockRejectedValueOnce(Object.assign(new Error('Listing not found'), { status: 404 }));
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listing: { ...listing, visibility: 'town' } } }} />);
    const submit = await screen.findByText('Send Request');
    await act(async () => fireEvent.press(submit));
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: listing.id }));
    expect(mockShowError).toHaveBeenCalledWith({ message: 'Listing not found' });
    expect(mockNavigation.replace).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('preserves the subscription access gate when paid tiers are enabled', async () => {
    mockPaidTiers = true;
    api.checkSubscriptionAccess.mockResolvedValue({ canAccess: false, requiredTier: 'plus' });
    const Screen = require('../../src/screens/BorrowRequestScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listing: { ...listing, visibility: 'town' } } }} />);
    await screen.findByText('Verify to Unlock');
    expect(api.checkSubscriptionAccess).toHaveBeenCalledWith('town');
    expect(screen.queryByText('Send Request')).toBeNull();
    expect(api.createTransaction).not.toHaveBeenCalled();
  });

  it('submits without message (message is optional)', async () => {
    const BorrowRequestScreen = require('../../src/screens/BorrowRequestScreen').default;
    const { findByText, getByText } = render(<BorrowRequestScreen navigation={mockNavigation} route={route} />);
    await findByText('Camera');
    await act(async () => { fireEvent.press(getByText('Send Request')); });
    expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1' }));
  });
});
