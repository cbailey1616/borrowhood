import React from 'react';
import { AppState, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { COLORS } from '../../src/utils/config';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, city: 'Boston', state: 'MA',
  latitude: 42.36, longitude: -71.06, profilePhotoUrl: null,
  onboardingCompleted: true, onboardingStep: 5, rating: 4.5, ratingCount: 10,
  totalTransactions: 5, isFounder: false, referralCode: 'BH-TEST', hasConnectAccount: false,
};

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(), canGoBack: () => true,
  isFocused: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true, refreshUser: jest.fn() }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  let session = 0;
  Crypto.randomUUID.mockImplementation(() => `session-${++session}`);
  AppState.addEventListener.mockReturnValue({ remove: jest.fn() });
  api.getFeed.mockResolvedValue({ items: [], hasMore: false });
  api.getSavedListings.mockResolvedValue([]);
  api.saveListing.mockResolvedValue({ saved: true });
  api.unsaveListing.mockResolvedValue({ saved: false });
  api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]);
  api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 });
});

describe('FeedScreen', () => {
  it('fetches a fresh first page when a request arrives in the foreground', async () => {
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('What would you like to do?');
    const previous = api.getFeed.mock.calls.at(-1)[0].session;
    api.getFeed.mockResolvedValue({ items: [{ id: 'new-request', type: 'request', title: 'Need a ladder', user: { id: 'neighbor', firstName: 'Robin' } }], hasMore: false });
    const receive = Notifications.addNotificationReceivedListener.mock.calls.at(-1)[0];
    await act(async () => receive({ request: { content: { data: { type: 'new_request' } } } }));
    await screen.findByText('Need a ladder');
    expect(api.getFeed.mock.calls.at(-1)[0].page).toBe(1);
    expect(api.getFeed.mock.calls.at(-1)[0].session).not.toBe(previous);
  });

  it('refreshes when returning to the app and removes the listener on unmount', async () => {
    const remove = jest.fn();
    const subscribe = AppState.addEventListener.mockReturnValue({ remove });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('What would you like to do?');
    const changeState = subscribe.mock.calls.at(-1)[1];
    act(() => changeState('background'));
    api.getFeed.mockClear();
    await act(async () => changeState('active'));
    expect(api.getFeed).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    screen.unmount();
    expect(remove).toHaveBeenCalled();
  });
  it('saves and unsaves from a listing card without opening its detail page', async () => {
    const item = { id: 'ladder', type: 'listing', title: 'Ladder', user: { id: 'owner', firstName: 'Robin', lastName: '' }, createdAt: new Date().toISOString() };
    let savedItems = [];
    api.getFeed.mockResolvedValue({ items: [item], hasMore: false });
    api.getSavedListings.mockImplementation(async () => savedItems);
    api.saveListing.mockImplementation(async () => { savedItems = [item]; return { saved: true }; });
    api.unsaveListing.mockImplementation(async () => { savedItems = []; return { saved: false }; });
    const Screen = require('../../src/screens/FeedScreen').default;
    const { findByLabelText } = render(<Screen navigation={mockNavigation} />);
    const stopPropagation = jest.fn();
    fireEvent.press(await findByLabelText('Save Ladder'), { stopPropagation });
    const unsave = await findByLabelText('Unsave Ladder');
    expect(api.saveListing).toHaveBeenCalledWith('ladder');
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(unsave, { stopPropagation });
    await findByLabelText('Save Ladder');
    expect(api.unsaveListing).toHaveBeenCalledWith('ladder');
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it('gives requests a sage note treatment while listings stay parchment', async () => {
    const author = { id: 'neighbor', firstName: 'Robin', lastName: '', isVerified: false };
    api.getFeed.mockResolvedValue({ items: [
      { id: 'note', type: 'request', title: 'Could use a ladder', user: author, createdAt: new Date().toISOString() },
      { id: 'item', type: 'listing', title: 'Garden tools', user: author, isFree: true, isAvailable: true, createdAt: new Date().toISOString() },
    ], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const { findByText, getByTestId, queryByText, getAllByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Neighbor request');
    expect(queryByText('REQUEST')).toBeNull();
    const style = id => StyleSheet.flatten(getByTestId(id).props.style);
    expect(style('Feed.request.note').backgroundColor).toBe(COLORS.requestSurface);
    expect(style('Feed.thread.note').backgroundColor).toBe(COLORS.requestSurface);
    expect(style('FeedCard').backgroundColor).toBe(COLORS.card);
    expect(style('Feed.thread.item').backgroundColor).toBe(COLORS.card);
    expect(style('Feed.request.note').borderRadius).toBe(style('FeedCard').borderRadius);
    expect(getAllByText('Public replies')).toHaveLength(2);
    fireEvent.press(getByTestId('Feed.request.note'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestDetail', { id: 'note' });
  });

  it.each([['listing', true], ['listing', false], ['request', true], ['request', undefined]])('shows identity badge only for verified %s authors (%s)', async (type, isVerified) => {
    api.getFeed.mockResolvedValue({ items: [{
      id: 'badge-test', type, title: 'Badge test item', isFree: true,
      user: { id: 'other', firstName: 'Bob', lastName: '', isVerified },
      createdAt: new Date().toISOString(),
    }], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const { findByText, queryByLabelText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Badge test item');
    expect(Boolean(queryByLabelText('Verified identity'))).toBe(isVerified === true);
  });

  it('starts with all permitted listings and requests', async () => {
    api.getFeed.mockResolvedValue({
      items: [{
        id: 'request-1', type: 'request', title: 'Power Drill', isFree: true, pricePerDay: 0,
        condition: 'good', visibility: 'close_friends',
        user: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null, isVerified: false, totalTransactions: 0 },
        photoUrl: 'https://test.com/photo.jpg', createdAt: new Date().toISOString(),
      }],
      hasMore: false,
    });
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByText } = render(<FeedScreen navigation={mockNavigation} />);
    await findByText('Power Drill');
    expect(api.getFeed).toHaveBeenCalledWith({ page: 1, limit: 20, session: expect.any(String) });
  });

  it('offers both sharing and asking without competing filters or a join banner', async () => {
    api.getCommunities.mockResolvedValue([]);
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const screen = render(<FeedScreen navigation={mockNavigation} />);
    await screen.findByText('What would you like to do?');
    expect(screen.queryByTestId('Feed.searchBar')).toBeNull();
    expect(screen.queryByText('Join a nearby neighborhood')).toBeNull();
    fireEvent.press(screen.getByLabelText('List an item'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateListing');
    fireEvent.press(screen.getByLabelText('Ask for something'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateRequest');
    expect(api.createListing).not.toHaveBeenCalled();
  });

  it('search bar renders', async () => {
    api.getFeed.mockResolvedValue({ items: [{ id: 'item', type: 'listing', title: 'Ladder', user: { firstName: 'Robin' } }], hasMore: false });
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByTestId } = render(<FeedScreen navigation={mockNavigation} />);
    await findByTestId('Feed.searchBar');
  });

  it('create button renders', async () => {
    api.getFeed.mockResolvedValue({ items: [{ id: 'item', type: 'listing', title: 'Ladder', user: { firstName: 'Robin' } }], hasMore: false });
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findAllByTestId } = render(<FeedScreen navigation={mockNavigation} />);
    const createBtns = await findAllByTestId('Feed.button.create');
    expect(createBtns.length).toBeGreaterThan(0);
  });

  it('tap listing navigates to ListingDetail', async () => {
    api.getFeed.mockResolvedValue({
      items: [{
        id: 'listing-1', type: 'listing', title: 'Camera', isFree: true, pricePerDay: 0,
        condition: 'good', visibility: 'close_friends',
        user: { id: 'user-2', firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null, isVerified: false, totalTransactions: 0 },
        photoUrl: 'https://test.com/photo.jpg', createdAt: new Date().toISOString(),
      }],
      hasMore: false,
    });
    const FeedScreen = require('../../src/screens/FeedScreen').default;
    const { findByText } = render(<FeedScreen navigation={mockNavigation} />);
    const listing = await findByText('Camera');
    fireEvent.press(listing);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDetail', expect.objectContaining({ id: 'listing-1' }));
  });
});

it('lets an unverified member select Town and makes hidden identities explicit', async () => {
  mockUser.isVerified = false;
  try {
    api.getFeed.mockResolvedValue({ items: [{ id: 'preview', type: 'listing', title: 'Town ladder', ownerMasked: true, previewOnly: true, user: { id: null, firstName: 'Town', lastName: 'neighbor' }, createdAt: new Date().toISOString() }], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Town ladder');
    fireEvent.press(screen.getByLabelText('Filter by visibility'));
    fireEvent.press(screen.getByLabelText('Town'));
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith('IdentityVerification', expect.anything());
    expect(screen.getByText('Identity hidden · Get verified')).toBeTruthy();
    expect(api.getDiscussions).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Close menu'));
    fireEvent.press(screen.getByLabelText('Identity hidden. Get verified to see who’s sharing'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('IdentityVerification', { source: 'town_browse' });
  } finally { mockUser.isVerified = true; }
});
