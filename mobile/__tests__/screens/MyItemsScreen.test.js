import React from 'react';
import { RefreshControl, InteractionManager } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Image } from 'expo-image';
import api from '../../src/services/api';

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    Swipeable: React.forwardRef(({ children, renderRightActions, onSwipeableOpen }, ref) => {
      React.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View testID="post-swipe" onSwipe={() => onSwipeableOpen?.('right')}>
        {children}
        {renderRightActions?.({}, { interpolate: () => 1 })}
      </View>;
    }),
  };
});

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  class Image extends React.PureComponent {
    static loadAsync = jest.fn(async () => ({ __expo_shared_object_id__: 1 }));
    static mounted = jest.fn();
    static sources = [];
    isPhoto = !this.props.source?.uri?.startsWith('data:');
    componentDidMount() {
      if (this.isPhoto) { Image.mounted(); Image.sources.push(this.props.source); }
    }
    componentDidUpdate(previous) {
      if (this.isPhoto && previous.source !== this.props.source) Image.sources.push(this.props.source);
    }
    render() { return <View testID={this.isPhoto ? 'native-photo' : undefined} {...this.props} />; }
  }
  return { Image };
});

const mockUser = {
  id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com',
  subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null,
  onboardingCompleted: true, rating: 4.5, ratingCount: 10, totalTransactions: 5,
};

const mockNavigation = {
  navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }),
  dispatch: jest.fn(), canGoBack: () => true,
};

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }),
}));
jest.mock('../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyListings.mockResolvedValue([]);
  api.getMyRequests.mockResolvedValue([]);
  api.getTransactions.mockResolvedValue([]);
  Image.sources = [];
});

describe('MyItemsScreen', () => {
  it.each(['listing', 'request'])('requires confirmation to delete a %s and lets the owner keep it', async type => {
    const post = { id:'post-1',title:'My ladder',status:type === 'listing' ? 'active' : 'open',isAvailable:true };
    (type === 'listing' ? api.getMyListings : api.getMyRequests).mockResolvedValue([post]);
    const deletePost = type === 'listing' ? api.deleteListing : api.deleteRequest;
    deletePost.mockResolvedValue({ success:true });
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    if (type === 'request') await act(async () => fireEvent.press(screen.getByTestId('MyItems.segment.1')));
    await screen.findByText('My ladder');
    fireEvent(screen.getByTestId('post-swipe'), 'swipe');
    expect(deletePost).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Delete'));
    await screen.findByText('Delete this post?');
    expect(deletePost).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Keep post'));
    await waitFor(() => expect(screen.queryByText('Delete this post?')).toBeNull());
    expect(deletePost).not.toHaveBeenCalled();
    expect(screen.getByText('My ladder')).toBeTruthy();
    fireEvent.press(screen.getByText('Delete'));
    fireEvent.press(await screen.findByText('Delete post'));
    await waitFor(() => expect(deletePost).toHaveBeenCalledWith('post-1'));
    expect(screen.queryByText('My ladder')).toBeNull();
  });

  it('keeps borrowed and paused inventory visible while completed transfers stay in History', async () => {
    const base = { condition: 'good', status: 'active', isAvailable: true, listingType: 'lend' };
    api.getMyListings.mockResolvedValue([
      { ...base, id: 'available', title: 'Available ladder' },
      { ...base, id: 'sold', title: 'Sold bike', listingType: 'sell', status: 'given_away', isAvailable: false },
      { ...base, id: 'claimed', title: 'Claimed books', listingType: 'giveaway', status: 'given_away', isAvailable: false },
      { ...base, id: 'borrowed', title: 'Borrowed drill', isAvailable: false, availabilityStatus: 'borrowed' },
      { ...base, id: 'paused', title: 'Paused mower', status: 'paused', isAvailable: false },
    ]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Available ladder');
    expect(screen.getByText('Borrowed drill')).toBeTruthy();
    expect(screen.getByText('Paused mower')).toBeTruthy();
    for (const text of ['Sold bike', 'Claimed books', 'Good']) expect(screen.queryByText(text)).toBeNull();
  });

  it('shows the borrower, return date, pending requests, and audience directly on an item', async () => {
    api.getMyListings.mockResolvedValue([{ id: 'ladder', title: 'Extension ladder', status: 'active',
      listingType: 'lend', isAvailable: false, availabilityStatus: 'borrowed', pendingRequests: 2,
      visibility: ['close_friends', 'neighborhood', 'town'] }]);
    api.getTransactions.mockResolvedValue([{ id: 'loan', listing: { id: 'ladder' }, listingType: 'lend',
      status: 'picked_up', isBorrower: false, borrower: { firstName: 'Alex' }, endDate: '2099-09-28' }]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('With Alex');
    expect(api.getTransactions).toHaveBeenCalledWith({ role: 'lender' });
    for (const text of ['Borrowed', 'Free to borrow', 'Due Sep 28', 'Friends · Neighborhood · Town', 'Review requests · 2']) expect(screen.getByText(text)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^View exchange for Extension ladder/ }));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('TransactionDetail', { id: 'loan' });
    fireEvent.press(screen.getByRole('button', { name: 'Review 2 requests for Extension ladder' }));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('RequestQueue', { listingId: 'ladder' });
  });

  it('keeps borrowed inventory visible when exchange details fail to load', async () => {
    api.getMyListings.mockResolvedValue([{ id: 'ladder', title: 'Extension ladder', status: 'active', isAvailable: false, availabilityStatus: 'borrowed' }]);
    api.getTransactions.mockRejectedValueOnce(new Error('Network unavailable'));
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Extension ladder');
    expect(screen.getByText('Borrowed')).toBeTruthy();
    expect(screen.getByText('Exchange details couldn’t load. Pull to refresh.')).toBeTruthy();
    expect(screen.queryByText('Your listings start here')).toBeNull();
  });

  it('refreshes an extended due date without retaining the previous deadline', async () => {
    api.getMyListings.mockResolvedValue([{ id: 'ladder', title: 'Extension ladder', status: 'active', isAvailable: false, availabilityStatus: 'borrowed' }]);
    const exchange = { id: 'loan', listing: { id: 'ladder' }, status: 'picked_up', isBorrower: false, borrower: { firstName: 'Alex' }, listingType: 'lend' };
    api.getTransactions.mockResolvedValueOnce([{ ...exchange, endDate: '2099-09-28' }]).mockResolvedValue([{ ...exchange, endDate: '2099-09-30' }]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await screen.findByText('Due Sep 28');
    await act(async () => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
    await screen.findByText('Due Sep 30');
    expect(screen.queryByText('Due Sep 28')).toBeNull();
  });

  it('retains its loaded image during refresh, fresh API objects, a focus fetch, and a failed refresh', async () => {
    const listing = {
      id: 'retained-photo', title: 'My ladder', status: 'active', condition: 'good', isAvailable: true,
      photoUrl: 'https://images.example/my-posts-ladder.jpg', timesBorrowed: 0,
    };
    api.getMyListings.mockResolvedValue([listing]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await waitFor(() => expect(screen.getByTestId('native-photo').props.source).toEqual({ __expo_shared_object_id__: 1 }));
    const view = screen.getByTestId('native-photo');
    const source = view.props.source;
    Image.sources = [];

    let finishRefresh;
    api.getMyListings.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    expect(screen.getByTestId('native-photo')).toBe(view);
    expect(screen.getByTestId('native-photo').props.source).toBe(source);
    await act(async () => finishRefresh([{ ...listing, title: 'Updated ladder' }]));
    await screen.findByText('Updated ladder');

    api.getMyListings.mockResolvedValue([{ ...listing }]);
    const interact = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(callback => {
      callback();
      return { cancel: jest.fn() };
    });
    try {
      const beforeFocus = api.getMyListings.mock.calls.length;
      const focus = mockNavigation.addListener.mock.calls.filter(([event]) => event === 'focus').at(-1)[1];
      await act(async () => focus());
      expect(api.getMyListings).toHaveBeenCalledTimes(beforeFocus + 1);
    } finally {
      interact.mockRestore();
    }
    api.getMyListings.mockRejectedValueOnce(new Error('offline'));
    await act(async () => fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'));
    await screen.findByText('Couldn’t load this list. Your items haven’t been changed.');
    expect(screen.getByTestId('native-photo')).toBe(view);
    expect(screen.getByTestId('native-photo').props.source).toBe(source);
    expect(Image.sources).toEqual([]);
    expect(Image.mounted).toHaveBeenCalledTimes(1);
    expect(Image.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('renders SegmentedControl', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const { findByTestId } = render(<MyItemsScreen navigation={mockNavigation} />);
    const segment = await findByTestId('MyItems.segment');
    expect(segment).toBeTruthy();
  });

  // My Items opens the owner's inventory, with exchanges and requests secondary.
  const selectTab = async (utils, index) => {
    const segment = await utils.findByTestId(`MyItems.segment.${index}`);
    await act(async () => {
      fireEvent.press(segment);
    });
  };

  it('opens own inventory without requiring a tab switch', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    expect(utils.getByTestId('MyItems.segment.0').props.accessibilityState.selected).toBe(true);
    await waitFor(() => {
      expect(api.getMyListings).toHaveBeenCalled();
    });
  });

  it('displays listing cards with title', async () => {
    api.getMyListings.mockResolvedValue([{
      id: 'listing-1', title: 'My Drill', status: 'active', condition: 'good', isFree: true,
      pricePerDay: 0, photos: ['https://test.com/photo.jpg'], isAvailable: true,
      timesBorrowed: 2, pendingRequests: 0,
    }]);
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    await selectTab(utils, 0);
    await utils.findByText('My Drill');
  });

  it('empty items state renders', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    await selectTab(utils, 0);
    await utils.findByText('Your listings start here');
  });

  it('loads wanted posts separately from sent item requests', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    await selectTab(utils, 1);
    await waitFor(() => {
      expect(api.getMyRequests).toHaveBeenCalled();
    });
    expect(api.getTransactions).not.toHaveBeenCalled();
    await selectTab(utils, 2);
    await waitFor(() => expect(api.getTransactions).toHaveBeenCalledWith({ role: 'borrower' }));
  });

  it('displays request cards', async () => {
    api.getMyRequests.mockResolvedValue([{
      id: 'req-1', title: 'Need a ladder', description: 'For painting',
      category: { name: 'Tools' }, status: 'open', createdAt: new Date().toISOString(),
    }]);
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    await selectTab(utils, 1);
    await utils.findByText('Need a ladder');
  });

  const sentRequest = {
    id: 'sent-1', status: 'pending', listingType: 'lend', isBorrower: true,
    listing: { id: 'glue', title: 'Cabinet glue' }, lender: { firstName: 'Chris' },
    startDate: '2026-09-17', endDate: '2026-09-18',
  };
  const postedRequest = { id: 'posted-1', title: 'Need a ladder', status: 'open' };
  it('separates wanted posts and sent requests even when their IDs match', async () => {
    // IDs can overlap across the two API resources.
    api.getTransactions.mockResolvedValue([{ ...sentRequest, id: postedRequest.id }]);
    api.getMyRequests.mockResolvedValue([postedRequest]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await selectTab(screen, 1);
    fireEvent.press(await screen.findByText('Need a ladder'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestDetail', { id: postedRequest.id });
    expect(screen.queryByText('Cabinet glue')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Filter requests:/ })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Post in Wanted' }));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('CreateRequest');

    await selectTab(screen, 2);
    await screen.findByText('Cabinet glue');
    expect(screen.getByText('Sep 17 – Sep 18')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Cabinet glue, Being reviewed' }));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('TransactionDetail', { id: postedRequest.id });
    expect(screen.queryByText('Need a ladder')).toBeNull();
    expect(screen.queryByTestId('post-swipe')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse items' })).toBeNull();
  });

  it('shows every active request without a filter or header Browse button', async () => {
    api.getTransactions.mockResolvedValue([sentRequest, { ...sentRequest, id: 'ready', status: 'approved', listing: { title: 'Ladder ready for pickup' } }]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await selectTab(screen, 2);
    await screen.findByText('Cabinet glue');
    expect(screen.getByText('Ladder ready for pickup')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Filter requests:/ })).toBeNull();
    expect(screen.queryByText('Browse')).toBeNull();
    expect(api.getTransactions).toHaveBeenCalledTimes(1);
  });

  it('keeps active outgoing requests visible and excludes incoming and finished exchanges', async () => {
    api.getTransactions.mockResolvedValue([
      sentRequest,
      { ...sentRequest, id: 'ready', status: 'approved', listingType: 'giveaway', startDate: null, endDate: null, listing: { title: 'Free books' } },
      { ...sentRequest, id: 'borrowed', status: 'picked_up', endDate: '2099-12-31', listing: { title: 'Borrowed drill' } },
      { ...sentRequest, id: 'return', status: 'return_pending', listing: { title: 'Ladder to return' } },
      { ...sentRequest, id: 'incoming', isBorrower: false, listing: { title: 'Someone wants my bike' } },
      ...['completed', 'returned', 'cancelled', 'declined', 'expired'].map(status => ({ ...sentRequest, id: status, status, listing: { title: `${status} item` } })),
      { ...sentRequest, id: 'given-away', listingType: 'giveaway', status: 'picked_up', listing: { title: 'Books already collected' } },
    ]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await selectTab(screen, 2);
    await screen.findByText('Cabinet glue');
    for (const label of ['Being reviewed', 'Ready for pickup', 'Currently borrowing', 'Waiting for return confirmation']) expect(screen.getByText(label)).toBeTruthy();
    for (const label of ['Someone wants my bike', 'completed item', 'returned item', 'cancelled item', 'declined item', 'expired item', 'Books already collected', 'Invalid Date']) expect(screen.queryByText(label)).toBeNull();
  });

  it('removes completed requests and offers one Browse items action', async () => {
    api.getTransactions.mockResolvedValue([sentRequest]);
    api.getMyRequests.mockResolvedValue([postedRequest]);
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await selectTab(screen, 2);
    await screen.findByText('Cabinet glue');
    api.getTransactions.mockResolvedValue([{ ...sentRequest, status: 'completed' }]);
    await act(async () => fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh'));
    await screen.findByText('No requests yet');
    expect(screen.queryByText('Cabinet glue')).toBeNull();
    expect(screen.queryByText('Need a ladder')).toBeNull();
    fireEvent.press(screen.getByText('Browse items'));
    expect(screen.getAllByRole('button', { name: 'Browse items' })).toHaveLength(1);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Feed', { browseItems: expect.any(String) });
    await selectTab(screen, 1);
    await screen.findByText('Need a ladder');
    await selectTab(screen, 2);
    expect(screen.queryByRole('button', { name: /^Filter requests:/ })).toBeNull();
  });

  it.each(['sent', 'posted'])('keeps the other tab usable when the %s list fails and supports retry', async failed => {
    api.getTransactions.mockResolvedValue([sentRequest]);
    api.getMyRequests.mockResolvedValue([postedRequest]);
    (failed === 'sent' ? api.getTransactions : api.getMyRequests).mockRejectedValueOnce(new Error('offline'));
    const Screen = require('../../src/screens/MyItemsScreen').default;
    const screen = render(<Screen navigation={mockNavigation} />);
    await selectTab(screen, failed === 'sent' ? 2 : 1);
    await screen.findByText(failed === 'sent' ? 'Couldn’t load your requests.' : 'Couldn’t load your wanted posts.');
    expect(screen.queryByText('No requests yet')).toBeNull();
    expect(screen.queryByText('No wanted posts yet')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    await screen.findByText(failed === 'sent' ? 'Cabinet glue' : 'Need a ladder');
    expect(screen.queryByRole('alert')).toBeNull();
    await selectTab(screen, failed === 'sent' ? 1 : 2);
    await screen.findByText(failed === 'sent' ? 'Need a ladder' : 'Cabinet glue');
  });
});
