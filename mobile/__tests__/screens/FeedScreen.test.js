import React from 'react';
import { AppState, FlatList, InteractionManager, RefreshControl, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { COLORS } from '../../src/utils/config';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import api from '../../src/services/api';
import { FeedSeenContext } from '../../src/hooks/useInboxBadges';

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
  AppState.currentState = 'active';
  api.getFeed.mockResolvedValue({ items: [], hasMore: false });
  api.getSavedListings.mockResolvedValue([]);
  api.saveListing.mockResolvedValue({ saved: true });
  api.unsaveListing.mockResolvedValue({ saved: false });
  api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]);
  api.getBadgeCount.mockResolvedValue({ messages: 0, notifications: 0, actions: 0, total: 0 });
  api.getTransactions.mockResolvedValue([]);
  api.getNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
});

describe('FeedScreen', () => {
  it.each(['listing', 'request', 'ribbon'])('shows the author’s woodland rank on a %s tile and opens its explanation without opening the post', async surface => {
    const item = { id: 'ranked-post', type: surface === 'listing' ? 'listing' : 'request', title: 'Garden tools', createdAt: '2026-09-12T08:00:00.000Z',
      user: { id: 'neighbor', firstName: 'Alexandra Very Long Display Name', isVerified: true,
        endorsement: { completedCount: 6, score: 91 } } };
    api.getFeed.mockResolvedValue(surface === 'ribbon'
      ? { items: [], requests: [item], hasMore: false }
      : { items: [item], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    const badge = await screen.findByLabelText('Neighbor rank: Ranger', {}, { timeout: 5000 });
    expect(badge.props.accessibilityRole).toBe('button');
    expect(screen.getByText(item.user.firstName)).toBeTruthy();
    expect(screen.getByLabelText('Verified identity')).toBeTruthy();
    expect(StyleSheet.flatten(badge.props.style)).toMatchObject({ width: 44, minHeight: 44 });
    expect(screen.queryByText(/completed exchanges/)).toBeNull();
    const stopPropagation = jest.fn();
    fireEvent.press(badge, { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('RankInfo.level.Ranger')).getByText('Current')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close rank explanation'));
    expect(screen.queryByText('Rating levels')).toBeNull();
    expect(api.getFeed).toHaveBeenCalledTimes(1);
  });

  it('shows the new-neighbor badge while keeping missing rank data distinct', async () => {
    api.getFeed.mockResolvedValue({ items: [
      { id: 'new', type: 'listing', title: 'New neighbor’s ladder', user: { firstName: 'Sam', endorsement: { completedCount: 1, score: null } } },
      { id: 'legacy', type: 'listing', title: 'Garden tools', user: { firstName: 'Jo', totalTransactions: 20, endorsement: { count: 20, percent: 100 } } },
    ], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    const badge = await screen.findByLabelText('Neighbor rank: New neighbor');
    expect(screen.getAllByLabelText(/Neighbor rank:/)).toHaveLength(1);
    fireEvent.press(badge);
    expect(screen.getByText('Rating after 3 completed exchanges')).toBeTruthy();
    expect(screen.queryByText('Current')).toBeNull();
  });

  it.each(['ownerMasked', 'previewOnly'])('does not show rank data on a %s preview', async flag => {
    api.getFeed.mockResolvedValue({ items: [{ id: 'preview', type: 'listing', title: 'Town ladder', [flag]: true,
      user: { firstName: 'Sam', endorsement: { completedCount: 6, score: 91 } } }], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Town ladder');
    expect(screen.queryByLabelText(/Neighbor rank:/)).toBeNull();
  });

  it('shows item and service requests together with their own labels', async () => {
    const user = { id: 'neighbor', firstName: 'Robin' };
    api.getFeed.mockResolvedValue({ items: [
      { id: 'ladder', type: 'request', requestType: 'item', title: 'Need a ladder', user },
      { id: 'babysitter', type: 'request', requestType: 'service', title: 'Babysitter', user },
    ], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Item wanted', {}, { timeout: 5000 });
    expect(screen.getByText('Help wanted')).toBeTruthy();
    fireEvent.press(screen.getByTestId('Feed.request.babysitter'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestDetail', { id: 'babysitter' });
    fireEvent.press(screen.getByTestId('Feed.type.requests'));
    await waitFor(() => expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'requests' })));
    expect(screen.getByText('Item wanted')).toBeTruthy();
    expect(screen.getByText('Help wanted')).toBeTruthy();
  });
  it('acknowledges new feed posts only after a successful, visible, unfiltered first page', async () => {
    const markSeen = jest.fn();
    const latestPostAt = '2026-09-09T12:00:00.000Z';
    api.getFeed.mockResolvedValue({ latestPostAt, items: [{ id: 'new-item', type: 'listing', title: 'New ladder', user: { firstName: 'Sam' } }], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<FeedSeenContext.Provider value={markSeen}><Screen navigation={mockNavigation} /></FeedSeenContext.Provider>);
    await screen.findByText('New ladder');
    expect(markSeen).toHaveBeenCalledWith(latestPostAt);
    markSeen.mockClear();
    fireEvent.press(screen.getByTestId('Feed.type.sell'));
    await waitFor(() => expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'sell' })));
    expect(markSeen).not.toHaveBeenCalled();
    api.getFeed.mockRejectedValue(new Error('offline'));
    fireEvent.press(screen.getByTestId('Feed.type.all'));
    await waitFor(() => expect(api.getFeed.mock.calls.at(-1)[0].type).toBeUndefined());
    expect(markSeen).not.toHaveBeenCalled();
  });

  it('keeps the ribbon reachable and scrolls to the top without refreshing when Home is tapped again', async () => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    api.getFeed.mockResolvedValue({ items: [{ id: 'ladder', type: 'listing', title: 'Ladder', user: { firstName: 'Sam' } }], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    const input = await screen.findByPlaceholderText('What do you need?');
    expect(within(screen.getByTestId('Feed.list')).queryByTestId('Feed.searchBar')).toBeNull();
    expect(within(screen.getByTestId('Feed.header')).getByTestId('Feed.typeRibbon')).toBeTruthy();
    fireEvent(input, 'focus');
    expect(StyleSheet.flatten(screen.getByTestId('Feed.header').props.style).transform).toEqual([{ translateY: 0 }]);
    fireEvent.changeText(input, 'ladder');
    fireEvent(input, 'blur');
    await waitFor(() => expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ladder' })));
    const tabPress = mockNavigation.addListener.mock.calls.filter(([event]) => event === 'tabPress').at(-1)[1];
    api.getFeed.mockClear();
    scroll.mockClear();
    await act(async () => tabPress());
    expect(api.getFeed).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(screen.getByText('Ladder')).toBeTruthy();
    scroll.mockRestore();
  });

  it('applies and clears extra filters while keeping the selected post type', async () => {
    api.getFeed.mockResolvedValue({ items: [{ id: 'drill', type: 'listing', title: 'Drill', user: { firstName: 'Jamie' } }], hasMore: false });
    api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools' }, { id: 'cat-2', name: 'Garden' }]);
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Drill', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('Feed.type.sell'));
    fireEvent.press(screen.getByLabelText('Filter posts'));
    fireEvent.press(await screen.findByLabelText('Filter by category'));
    fireEvent.press(await screen.findByLabelText('Tools'));
    await waitFor(() => expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'sell', categoryId: 'cat-1' })));
    fireEvent.press(screen.getByText('Done'));
    fireEvent.press(screen.getByLabelText('Filter posts'));
    fireEvent.press(await screen.findByLabelText('Clear filters'));
    await waitFor(() => {
      expect(api.getFeed.mock.calls.at(-1)[0].categoryId).toBeUndefined();
      expect(api.getFeed.mock.calls.at(-1)[0].type).toBe('sell');
    });
  });

  it('filters by the visible listing types and restores the mixed feed with All', async () => {
    api.getFeed.mockResolvedValue({ items: [{ id: 'bike', type: 'listing', title: 'Bike', user: { firstName: 'Sam' } }], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Bike');
    fireEvent.press(screen.getByTestId('Feed.type.sell'));
    await waitFor(() => expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'sell', page: 1 })));
    fireEvent.press(screen.getByTestId('Feed.type.all'));
    await waitFor(() => expect(api.getFeed.mock.calls.at(-1)[0].type).toBeUndefined());
  });

  it.each(['listing', 'request'])('opens the correct public discussion from a %s tile', async type => {
    api.getFeed.mockResolvedValue({ items: [{ id: 'post-1', type, title: 'A ladder', user: { firstName: 'Sam' } }], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await screen.findByLabelText('Comments on A ladder'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDiscussion', type === 'request' ? { requestId: 'post-1' } : { listingId: 'post-1' });
    expect(api.getDiscussions).not.toHaveBeenCalled();
    expect(api.getRequestDiscussions).not.toHaveBeenCalled();
  });

  it('waits for pull-to-refresh before adding an incoming request and starting a new ranking session', async () => {
    const markSeen = jest.fn();
    const latestPostAt = '2026-09-12T12:00:00.000Z';
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<FeedSeenContext.Provider value={markSeen}><Screen navigation={mockNavigation} /></FeedSeenContext.Provider>);
    await screen.findByText('What would you like to do?');
    const previous = api.getFeed.mock.calls.at(-1)[0].session;
    api.getFeed.mockClear();
    markSeen.mockClear();
    api.getFeed.mockResolvedValue({ latestPostAt, items: [{ id: 'new-request', type: 'request', title: 'Need a ladder', user: { id: 'neighbor', firstName: 'Robin' } }], hasMore: false });
    const receive = Notifications.addNotificationReceivedListener.mock.calls.at(-1)[0];
    await act(async () => receive({ request: { content: { data: { type: 'new_request' } } } }));
    expect(api.getFeed).not.toHaveBeenCalled();
    expect(markSeen).not.toHaveBeenCalled();
    expect(screen.queryByText('Need a ladder')).toBeNull();
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('Need a ladder');
    expect(api.getFeed.mock.calls.at(-1)[0].page).toBe(1);
    expect(api.getFeed.mock.calls.at(-1)[0].session).not.toBe(previous);
    expect(markSeen).toHaveBeenCalledWith(latestPostAt);
  });

  it('updates status without replacing the feed when returning to the app and removes its listener', async () => {
    const remove = jest.fn();
    const subscribe = AppState.addEventListener.mockReturnValue({ remove });
    const Screen = require('../../src/screens/FeedScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('What would you like to do?');
    const changeState = subscribe.mock.calls.at(-1)[1];
    act(() => changeState('background'));
    api.getFeed.mockClear();
    api.getNotifications.mockClear();
    api.getTransactions.mockClear();
    api.getDisputes.mockClear();
    await act(async () => changeState('active'));
    expect(api.getFeed).not.toHaveBeenCalled();
    expect(api.getTransactions).toHaveBeenCalled();
    expect(api.getDisputes).toHaveBeenCalled();
    expect(api.getNotifications).not.toHaveBeenCalled();
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

  it('gives requests a neutral surface inside an outlined card', async () => {
    const author = { id: 'neighbor', firstName: 'Robin', lastName: '', isVerified: false };
    api.getFeed.mockResolvedValue({ items: [
      { id: 'note', type: 'request', title: 'Could use a ladder', user: author, createdAt: new Date().toISOString() },
      { id: 'item', type: 'listing', title: 'Garden tools', user: author, isFree: true, isAvailable: true, createdAt: new Date().toISOString() },
    ], hasMore: false });
    const Screen = require('../../src/screens/FeedScreen').default;
    const { findByText, getByTestId, queryByText, getAllByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Wanted post');
    expect(queryByText('REQUEST')).toBeNull();
    const style = id => StyleSheet.flatten(getByTestId(id).props.style);
    expect(style('Feed.request.note').backgroundColor).toBe(COLORS.card);
    expect(style('FeedCard').backgroundColor).toBe(COLORS.card);
    expect(style('Feed.request.note').borderRadius).toBe(style('FeedCard').borderRadius);
    expect(queryByText('View comments')).toBeNull();
    expect(queryByText('Private message')).toBeNull();
    expect(api.getDiscussions).not.toHaveBeenCalled();
    expect(api.getRequestDiscussions).not.toHaveBeenCalled();
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
    expect(api.getFeed).toHaveBeenCalledWith({ layout:'sections', page: 1, limit: 20, session: expect.any(String) });
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
    fireEvent.press(screen.getByLabelText('Post in Wanted'));
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
    expect(screen.queryByLabelText('Comments on Town ladder')).toBeNull();
    fireEvent.press(screen.getByLabelText('Filter posts'));
    fireEvent.press(screen.getByLabelText('Filter by visibility'));
    fireEvent.press(screen.getByLabelText('Town'));
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith('IdentityVerification', expect.anything());
    expect(screen.getByText('Identity hidden · Get verified')).toBeTruthy();
    expect(api.getDiscussions).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Done'));
    fireEvent.press(screen.getByLabelText('Identity hidden. Get verified to see who’s sharing'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('IdentityVerification', { source: 'town_browse' });
  } finally { mockUser.isVerified = true; }
});

it('keeps requests in a swipe row and uses the Requests tab for the full view',async()=>{
 const user={id:'neighbor',firstName:'Alex'};
 api.getFeed.mockImplementation(async params=>params.type==='requests' ? {items:[{id:'ask',type:'request',title:'Need a ladder',user}],hasMore:false} : {items:[{id:'item',type:'listing',title:'Drill',user}],requests:[{id:'ask',type:'request',title:'Need a ladder',user}],hasMore:false});
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 await screen.findByText('Neighbors are looking for');
 expect(screen.getByText('Available nearby')).toBeTruthy();
 expect(screen.getByTestId('Feed.requests.carousel').props.horizontal).toBe(true);
 expect(screen.getByTestId('Feed.list').props.data.some(item=>item.type==='request')).toBe(false);
 expect(screen.queryByLabelText('See all requests')).toBeNull();
 fireEvent.press(screen.getByText('Wanted'));
 await waitFor(()=>expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({type:'requests'})));
 expect(screen.queryByText('Neighbors are looking for')).toBeNull();
 expect(screen.queryByText('Available nearby')).toBeNull();
});

it('keeps reserved and borrowed items out of Available nearby even on an older server', async () => {
 const user={id:'neighbor',firstName:'Alex'};
 api.getFeed.mockResolvedValue({items:[
  {id:'available',type:'listing',title:'Available drill',user,isAvailable:true},
  {id:'reserved',type:'listing',title:'Reserved ladder',user,availabilityStatus:'reserved'},
  {id:'borrowed',type:'listing',title:'Borrowed saw',user,isBorrowed:true},
  {id:'paused',type:'listing',title:'Paused mower',user,isAvailable:false},
 ],requests:[],hasMore:false});
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 await screen.findByText('Available drill');
 for(const title of ['Reserved ladder','Borrowed saw','Paused mower']) expect(screen.queryByText(title)).toBeNull();
});

it('aligns ribbon cards with photos and long text with cards that have neither', async () => {
 const user={id:'neighbor',firstName:'Alex'};
 api.getFeed.mockResolvedValue({items:[],requests:[
  {id:'photo',type:'request',title:'A long item request title that should wrap',description:'A long description stays in the detail page',photoUrl:'https://test.example/photo.jpg',user},
  {id:'plain',type:'request',title:'Ladder',user},
 ],hasMore:false});
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 const photo=await screen.findByTestId('Feed.ribbon.card.photo');
 const plain=screen.getByTestId('Feed.ribbon.card.plain');
 const {StyleSheet}=require('react-native');
 expect(StyleSheet.flatten(photo.props.style).height).toBe(StyleSheet.flatten(plain.props.style).height);
 fireEvent.press(screen.getByTestId('Feed.request.photo'));
 expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestDetail',{id:'photo'});
 fireEvent.press(screen.getByLabelText('Comments on Ladder'));
 expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDiscussion',{requestId:'plain'});
 fireEvent.press(screen.getByLabelText('View wanted post: Ladder'));
 expect(mockNavigation.navigate).toHaveBeenLastCalledWith('RequestDetail',{id:'plain'});
});

it('shows one specific request action and opens its queue directly', async () => {
 api.getTransactions.mockResolvedValueOnce([{id:'pending',status:'pending',lender:{id:mockUser.id},listing:{id:'ladder',title:'Ladder'}}]);
 api.getFeed.mockResolvedValue({items:[{id:'item',type:'listing',title:'Drill',user:{firstName:'Sam'}}],requests:[{id:'ask',type:'request',title:'Need a ladder',user:{firstName:'Alex'}}],hasMore:false});
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 await screen.findByText('Someone wants Ladder');
 expect(screen.getByText('Review request')).toBeTruthy();
 expect(screen.getByTestId('Feed.list').props.data.slice(0,2).map(row=>row.type)).toEqual(['feed-banners','request-carousel']);
 fireEvent.press(screen.getByText('Review request'));
 expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestQueue', { listingId: 'ladder' });
});

it('keeps Home quiet for an ongoing borrow and removes unread and setup banners', async () => {
 api.getTransactions.mockResolvedValue([{ id:'borrow',status:'picked_up',isBorrower:true,listing:{title:'Ladder'},endDate:'2099-09-20' }]);
 api.getNotifications.mockResolvedValue({ notifications:[],unreadCount:4 });
 api.getCommunities.mockResolvedValue([]);
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 await screen.findByText('What would you like to do?');
 expect(screen.queryByTestId('Feed.exchanges')).toBeNull();
 expect(screen.queryByText('4 unread notifications')).toBeNull();
 expect(screen.queryByText('Join a nearby neighborhood')).toBeNull();
 expect(api.getNotifications).not.toHaveBeenCalled();
});

it('shows only the most urgent item action, without stacked unread banners', async () => {
 const overdue = new Date(Date.now() - 7 * 86400000).toISOString();
 api.getTransactions.mockResolvedValue([
  { id:'return',status:'picked_up',isBorrower:true,endDate:overdue,listing:{id:'ladder',title:'Ladder'} },
  { id:'pending',status:'pending',isBorrower:false,lender:{id:mockUser.id},listing:{id:'drill',title:'Drill'} },
  { id:'sold',status:'picked_up',isBorrower:true,listingType:'sell',endDate:overdue,listing:{id:'bike'} },
  { id:'done',status:'returned',isBorrower:true,endDate:overdue,listing:{id:'rake'} },
 ]);
 api.getNotifications.mockResolvedValue({ notifications:[],unreadCount:2 });
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 await screen.findByText('Ladder overdue');
 expect(screen.queryByText('2 unread notifications')).toBeNull();
 expect(screen.queryByText('Someone wants Drill')).toBeNull();
 expect(screen.getAllByTestId('Feed.exchanges')).toHaveLength(1);
 fireEvent.press(screen.getByText('View details'));
 expect(mockNavigation.navigate).toHaveBeenCalledWith('TransactionDetail', { id: 'return' });
});

it('shows only a dispute requiring this person’s response and opens it directly', async () => {
 api.getDisputes.mockResolvedValueOnce([
  { id:'dispute-1',status:'awaitingResponse',respondent:{id:mockUser.id},listing:{title:'Ladder'} },
  { id:'dispute-2',status:'underReview' },
 ]);
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 fireEvent.press(await screen.findByText('Review an issue with Ladder'));
 expect(mockNavigation.navigate).toHaveBeenCalledWith('DisputeDetail', { id: 'dispute-1' });
});

it('hides own posts from the carousel, filters and older server pages', async () => {
  const own = { id: mockUser.id, firstName: 'Me' }, neighbor = { id: 'neighbor', firstName: 'Sam' };
  api.getFeed.mockImplementation(async ({ type }) => ({
    items: type === 'requests' ? [
      { id: 'own-request', type: 'request', title: 'My request', user: own },
      { id: 'their-request', type: 'request', title: 'Need a garden rake', user: neighbor },
    ] : [
      { id: 'own-listing', type: 'listing', title: 'My item', owner: own },
      { id: 'their-listing', type: 'listing', title: 'Neighbor item', user: neighbor },
    ],
    requests: [{ id: 'own-request', type: 'request', title: 'My request', user: own }], hasMore: false,
  }));
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('Neighbor item');
  expect(screen.queryByText('My item')).toBeNull();
  expect(screen.queryByText('My request')).toBeNull();
  expect(screen.queryByText('Neighbors are looking for')).toBeNull();
  fireEvent.press(screen.getByTestId('Feed.type.requests'));
  await screen.findByText('Need a garden rake');
  expect(screen.queryByText('My request')).toBeNull();
});

it('keeps an actionable reminder visible when all returned posts belong to you', async () => {
  api.getFeed.mockResolvedValue({ items: [{ id: 'mine', type: 'listing', title: 'My item', user: mockUser }], hasMore: false });
  api.getTransactions.mockResolvedValueOnce([{id:'pending',status:'pending',isBorrower:false,listing:{id:'ladder',title:'Ladder'}}]);
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('Someone wants Ladder');
  expect(screen.queryByText('My item')).toBeNull();
  expect(screen.queryByText('Neighbors are looking for')).toBeNull();
  expect(screen.getByText('What would you like to do?')).toBeTruthy();
});

it('retains posts through hidden pages and stops loading at the real end', async () => {
  const item = id => ({ id, type: 'listing', title: id, user: { id: 'neighbor', firstName: 'Sam' } });
  let finish;
  api.getFeed.mockImplementation(({ page }) => {
    if (page === 1) return Promise.resolve({ items: [item('First item')], hasMore: true });
    if (page === 2) return new Promise(resolve => { finish = resolve; });
    return Promise.resolve({ items: [item('Last item')], page: 4, hasMore: false });
  });
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('First item');
  act(() => {
    fireEvent(screen.getByTestId('Feed.list'), 'endReached');
    fireEvent(screen.getByTestId('Feed.list'), 'endReached');
  });
  expect(api.getFeed.mock.calls.filter(([params]) => params.page === 2)).toHaveLength(1);
  expect(screen.getByText('First item')).toBeTruthy();
  await act(async () => finish({ items: [], hasMore: true }));
  await screen.findByText('Last item');
  expect(screen.getByText('First item')).toBeTruthy();
  expect(screen.getByText('You’re all caught up')).toBeTruthy();
  const count = api.getFeed.mock.calls.length;
  fireEvent(screen.getByTestId('Feed.list'), 'endReached');
  expect(api.getFeed).toHaveBeenCalledTimes(count);
});

it('lets pull-to-refresh settle naturally while filters and Back to top still reset the list', async () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  api.getFeed.mockResolvedValue({ items: [{ id: 'one', type: 'listing', title: 'One item', user: { firstName: 'Sam' } }], hasMore: false });
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('One item');
  scroll.mockClear();
  fireEvent.press(screen.getByLabelText('Back to top'));
  expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: true });
  scroll.mockClear();
  await act(async () => fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'));
  expect(scroll).not.toHaveBeenCalled();
  expect(screen.getByText('One item')).toBeTruthy();
  fireEvent.press(screen.getByTestId('Feed.type.sell'));
  await waitFor(() => expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: false }));
  scroll.mockRestore();
});

it.each(['success', 'failure'])('keeps native refresh in control through a delayed %s', async outcome => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  api.getFeed.mockResolvedValueOnce({ items: [{ id: 'one', type: 'listing', title: 'One item', user: { firstName: 'Sam' } }], hasMore: false });
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('One item');
  fireEvent(screen.getByTestId('Feed.header'), 'layout', { nativeEvent: { layout: { height: 210 } } });
  expect(screen.UNSAFE_getByType(RefreshControl).props.progressViewOffset).toBe(210);
  let finish, fail;
  api.getFeed.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  scroll.mockClear();
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
  expect(screen.getByText('One item')).toBeTruthy();
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => outcome === 'success'
    ? finish({ items: [{ id: 'two', type: 'listing', title: 'New item', user: { firstName: 'Sam' } }], hasMore: false })
    : fail(new Error('offline')));
  expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  expect(screen.getByText(outcome === 'success' ? 'New item' : 'One item')).toBeTruthy();
  expect(scroll).not.toHaveBeenCalled();
  scroll.mockRestore();
});

it('does not expand and collapse the empty feed ribbon during refresh', async () => {
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('What would you like to do?');
  let finish;
  api.getFeed.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(screen.queryByTestId('Feed.searchBar')).toBeNull();
  expect(screen.queryByTestId('Feed.typeRibbon')).toBeNull();
  expect(screen.getByText('What would you like to do?')).toBeTruthy();
  expect(screen.queryByLabelText('Loading items')).toBeNull();
  await act(async () => finish({ items: [], hasMore: false }));
  expect(screen.queryByTestId('Feed.searchBar')).toBeNull();
  expect(screen.getByText('What would you like to do?')).toBeTruthy();
});

it('keeps loaded pages, request cards, ranking session, and scroll position when returning from a post', async () => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  const interact = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(callback => {
    callback();
    return { cancel: jest.fn() };
  });
  const item = id => ({ id, type: 'listing', title: id, user: { id: 'neighbor', firstName: 'Sam' } });
  const request = { id: 'request', type: 'request', title: 'Need a drill', user: { id: 'neighbor', firstName: 'Sam' } };
  api.getFeed.mockImplementation(({ page }) => Promise.resolve({
    items: page === 1 ? [item('First'), item('Second')] : page === 2 ? [item('Third')] : [item('Fourth')],
    requests: page === 1 ? [request] : [], hasMore: page < 3,
  }));
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('First');
  const session = api.getFeed.mock.calls[0][0].session;
  fireEvent(screen.getByTestId('Feed.list'), 'endReached');
  await screen.findByText('Third');
  const beforeReturn = api.getFeed.mock.calls.length;
  const statusCalls = api.getTransactions.mock.calls.length;
  const returnToHome = mockNavigation.addListener.mock.calls.filter(([event]) => event === 'focus').at(-1)[1];
  scroll.mockClear();
  await act(async () => returnToHome());
  expect(api.getFeed).toHaveBeenCalledTimes(beforeReturn);
  expect(api.getTransactions.mock.calls.length).toBeGreaterThan(statusCalls);
  expect(scroll).not.toHaveBeenCalled();
  expect(screen.getByTestId('Feed.list').props.data.filter(item => item.type === 'listing').map(item => item.id)).toEqual(['First', 'Second', 'Third']);
  expect(screen.getByText('Need a drill')).toBeTruthy();
  fireEvent(screen.getByTestId('Feed.list'), 'endReached');
  await screen.findByText('Fourth');
  expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, session }));
  scroll.mockRestore();
  interact.mockRestore();
});

it('replaces a paginated feed with a fresh order only on manual refresh', async () => {
  const item = id => ({ id, type: 'listing', title: id, user: { id: 'neighbor', firstName: 'Sam' } });
  api.getFeed.mockResolvedValueOnce({ items: [item('First'), item('Second')], hasMore: true })
    .mockResolvedValueOnce({ items: [item('Third')], hasMore: false })
    .mockResolvedValueOnce({ items: [item('Second'), item('New'), item('First')], hasMore: true })
    .mockResolvedValue({ items: [item('Third')], hasMore: false });
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('First');
  const originalSession = api.getFeed.mock.calls[0][0].session;
  fireEvent(screen.getByTestId('Feed.list'), 'endReached');
  await screen.findByText('Third');
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  await screen.findByText('New');
  const refreshedSession = api.getFeed.mock.calls.at(-1)[0].session;
  expect(refreshedSession).not.toBe(originalSession);
  expect(screen.getByTestId('Feed.list').props.data.filter(item => item.type === 'listing').map(item => item.id)).toEqual(['Second', 'New', 'First']);
  fireEvent(screen.getByTestId('Feed.list'), 'endReached');
  await screen.findByText('Third');
  expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, session: refreshedSession }));
});

it('keeps loaded posts and offers retry when loading the next page fails', async () => {
  api.getFeed.mockResolvedValueOnce({ items: [{ id: 'one', type: 'listing', title: 'One item', user: { firstName: 'Sam' } }], hasMore: true })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ items: [{ id: 'two', type: 'listing', title: 'Two items', user: { firstName: 'Sam' } }], hasMore: false });
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen = render(<Screen navigation={mockNavigation} />);
  await screen.findByText('One item');
  fireEvent(screen.getByTestId('Feed.list'), 'endReached');
  await screen.findByText('Couldn’t load more posts.');
  expect(screen.getByText('One item')).toBeTruthy();
  fireEvent.press(screen.getByText('Try again'));
  await screen.findByText('Two items');
  expect(screen.getByText('One item')).toBeTruthy();
});

it('Browse items opens the default All feed on first mount', async () => {
  const Screen = require('../../src/screens/FeedScreen').default;
  render(<Screen navigation={mockNavigation} route={{ params: { browseItems: 'first' } }} />);
  await waitFor(() => expect(api.getFeed).toHaveBeenCalled());
  expect(api.getFeed.mock.calls.every(([params]) => params.type === undefined)).toBe(true);
});

it('a new Browse items request clears Wanted and search, without resetting ordinary returns', async () => {
  api.getFeed.mockImplementation(async ({type}) => ({ items: [{ id:'item',type:type==='requests'?'request':'listing',title:type==='requests'?'Need a ladder':'Ladder',user:{id:'neighbor',firstName:'Sam'} }],hasMore:false }));
  const Screen = require('../../src/screens/FeedScreen').default;
  const screen=render(<Screen navigation={mockNavigation} />);
  await screen.findByText('Ladder');
  fireEvent.press(screen.getByTestId('Feed.type.requests'));
  await waitFor(()=>expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({type:'requests'})));
  fireEvent.changeText(screen.getByTestId('Feed.searchBar'),'saw');
  const route={params:{browseItems:'from-my-requests'}};
  screen.rerender(<Screen navigation={mockNavigation} route={route}/>);
  await waitFor(()=>expect(api.getFeed.mock.calls.at(-1)[0]).not.toHaveProperty('type'));
  expect(api.getFeed.mock.calls.at(-1)[0]).not.toHaveProperty('search');
  expect(screen.getByTestId('Feed.type.all').props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByTestId('Feed.type.giveaway'));
  await waitFor(()=>expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({type:'giveaway'})));
  screen.rerender(<Screen navigation={mockNavigation} route={route}/>);
  expect(screen.getByTestId('Feed.type.giveaway').props.accessibilityState.selected).toBe(true);
  screen.rerender(<Screen navigation={mockNavigation} route={{params:{browseItems:'another-visit'}}}/>);
  await waitFor(()=>expect(api.getFeed.mock.calls.at(-1)[0]).not.toHaveProperty('type'));
});

it('Browse items supersedes a slow initial feed without leaving it loading', async () => {
  let finishOld;
  api.getFeed.mockImplementationOnce(() => new Promise(resolve => { finishOld=resolve; }))
    .mockResolvedValue({items:[{id:'fresh',type:'listing',title:'Available drill',user:{firstName:'Sam'}}],hasMore:false});
  const Screen=require('../../src/screens/FeedScreen').default;
  const screen=render(<Screen navigation={mockNavigation}/>);
  screen.rerender(<Screen navigation={mockNavigation} route={{params:{browseItems:'new-intent'}}}/>);
  await screen.findByText('Available drill');
  await act(async()=>finishOld({items:[{id:'old',type:'request',title:'Old wanted post',user:{firstName:'Sam'}}],hasMore:false}));
  expect(screen.queryByText('Old wanted post')).toBeNull();
  expect(screen.getByText('Available drill')).toBeTruthy();
});

it('opens neighborhood items directly with a visible, removable scope', async () => {
 const Screen=require('../../src/screens/FeedScreen').default;
 const selection={id:'hood-1',name:'Maple Grove',requestId:'open-1'};
 const markSeen=jest.fn();
 const screen=render(<FeedSeenContext.Provider value={markSeen}><Screen navigation={mockNavigation} route={{params:{neighborhoodItems:selection}}}/></FeedSeenContext.Provider>);
 await screen.findByText('Maple Grove');
 expect(api.getFeed.mock.calls.every(([p])=>p.communityId==='hood-1')).toBe(true);
 expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({communityId:'hood-1',type:'listings,giveaway,sell',visibility:'neighborhood'}));
 expect(screen.getByLabelText('All items').props.accessibilityState.selected).toBe(true);
 expect(markSeen).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('Clear neighborhood filter'));
 await waitFor(()=>expect(api.getFeed.mock.calls.at(-1)[0].communityId).toBeUndefined());
 expect(api.getFeed.mock.calls.at(-1)[0].visibility).toBeUndefined();
 expect(screen.queryByText('Maple Grove')).toBeNull();
});

it('clears old Wanted and search selections when the neighborhood shortcut is used', async () => {
 api.getFeed.mockResolvedValue({items:[{id:'item',type:'listing',title:'Drill',user:{firstName:'Sam'}}],hasMore:false});
 const Screen=require('../../src/screens/FeedScreen').default;
 const screen=render(<Screen navigation={mockNavigation}/>);
 await screen.findByText('Drill');
 fireEvent.press(screen.getByTestId('Feed.type.requests'));
 fireEvent.changeText(screen.getByPlaceholderText('What do you need?'),'ladder');
 const route={params:{neighborhoodItems:{id:'hood-1',name:'Maple Grove',requestId:'open-1'}}};
 screen.rerender(<Screen navigation={mockNavigation} route={route}/>);
 await waitFor(()=>expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({communityId:'hood-1',type:'listings,giveaway,sell'})));
 expect(api.getFeed.mock.calls.at(-1)[0].search).toBeUndefined();
 expect(screen.getByPlaceholderText('What do you need?').props.value).toBe('');
 fireEvent.press(screen.getByTestId('Feed.type.giveaway'));
 await waitFor(()=>expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({type:'giveaway',communityId:'hood-1'})));
 screen.rerender(<Screen navigation={mockNavigation} route={route}/>);
 expect(screen.getByTestId('Feed.type.giveaway').props.accessibilityState.selected).toBe(true);
 screen.rerender(<Screen navigation={mockNavigation} route={{params:{neighborhoodItems:{id:'hood-2',name:'Oak Lane',requestId:'open-2'}}}}/>);
 await waitFor(()=>expect(api.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({communityId:'hood-2',type:'listings,giveaway,sell'})));
 await screen.findByText('Oak Lane');
});

it('returns to the full feed when Browse items is used after a neighborhood shortcut',async()=>{
 const Screen=require('../../src/screens/FeedScreen').default;
 const neighborhoodItems={id:'hood-1',name:'Maple Grove',requestId:'open-1'};
 const screen=render(<Screen navigation={mockNavigation} route={{params:{neighborhoodItems}}}/>);
 await screen.findByText('Maple Grove');
 screen.rerender(<Screen navigation={mockNavigation} route={{params:{neighborhoodItems,browseItems:'browse-2'}}}/>);
 await waitFor(()=>expect(api.getFeed.mock.calls.at(-1)[0].communityId).toBeUndefined());
 expect(api.getFeed.mock.calls.at(-1)[0].type).toBeUndefined();
 expect(screen.queryByText('Maple Grove')).toBeNull();
});
