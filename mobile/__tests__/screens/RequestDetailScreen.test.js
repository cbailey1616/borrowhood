import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

const mockRequest = {
  id: 'req-1', title: 'Need a Camera', type: 'item', status: 'open', visibility: 'close_friends',
  category: 'Electronics', description: 'For a photo project',
  isOwner: false,
  requester: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null, totalTransactions: 5 },
  createdAt: new Date().toISOString(),
};

beforeEach(() => { jest.clearAllMocks(); api.getRequest.mockResolvedValue(mockRequest); });

describe('RequestDetailScreen', () => {
  const route = { params: { id: 'req-1' } };

  it('shows an expired request honestly and does not offer an action that will fail', async () => {
    api.getRequest.mockResolvedValueOnce({ ...mockRequest, isExpired: true });
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Expired');
    expect(screen.queryByText('Offer an item privately')).toBeNull();
    expect(screen.getByText(/renew it from My Posts/)).toBeTruthy();
  });

  it('fetches request via api.getRequest', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getRequest).toHaveBeenCalledWith('req-1'); });
  });

  it('displays request title', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Need a Camera');
  });

  it('displays status badge', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/open/i);
  });

  it('displays requester info', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });

  it('non-owner can offer one item privately', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    const offer = await findByText('Offer an item privately');
    fireEvent.press(offer);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('OfferItem', expect.anything());
  });

  it('owner sees edit and close buttons', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, isOwner: true, requester: { ...mockRequest.requester, id: 'user-1' } });
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Edit/i);
  });
});

it('explains hidden Town identity without fetching private discussions or offers', async () => {
  api.getRequest.mockResolvedValue({ ...mockRequest, ownerMasked: true, previewOnly: true, requester: { id: null, firstName: 'Town', lastName: 'neighbor' } });
  const Screen = require('../../src/screens/RequestDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'req-1' } }} />);
  await screen.findByText('Need a Camera');
  expect(api.getRequestDiscussions).not.toHaveBeenCalled();
  expect(api.getRequestOffers).not.toHaveBeenCalled();
  expect(screen.queryByText('Offer an item privately')).toBeNull();
  fireEvent.press(screen.getByLabelText('Identity hidden. Get verified to see who’s sharing'));
  expect(mockNavigation.navigate).toHaveBeenCalledWith('IdentityVerification', { source: 'town_browse' });
});
