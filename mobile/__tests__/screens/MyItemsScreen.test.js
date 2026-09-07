import React from 'react';
import { RefreshControl, InteractionManager } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Image } from 'expo-image';
import api from '../../src/services/api';

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
  Image.sources = [];
});

describe('MyItemsScreen', () => {
  it('retains its loaded image during refresh, fresh API objects, a focus fetch, and a failed refresh', async () => {
    const listing = {
      id: 'retained-photo', title: 'My ladder', condition: 'good', isAvailable: true,
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
      id: 'listing-1', title: 'My Drill', condition: 'good', isFree: true,
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

  it('requests tab calls api.getMyRequests', async () => {
    const MyItemsScreen = require('../../src/screens/MyItemsScreen').default;
    const utils = render(<MyItemsScreen navigation={mockNavigation} />);
    // Switch to ISO tab (index 2)
    await selectTab(utils, 1);
    await waitFor(() => {
      expect(api.getMyRequests).toHaveBeenCalled();
    });
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
});
