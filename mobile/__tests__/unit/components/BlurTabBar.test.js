import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { COLORS } from '../../../src/utils/config';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

const createTabBarProps = (activeIndex = 0) => ({
  state: {
    index: activeIndex,
    routes: [
      { key: 'Feed-key', name: 'Feed' },
      { key: 'Saved-key', name: 'Saved' },
      { key: 'MyItems-key', name: 'MyItems' },
      { key: 'Activity-key', name: 'Activity' },
      { key: 'Profile-key', name: 'Profile' },
    ],
  },
  descriptors: {
    'Feed-key': { options: {} },
    'Saved-key': { options: {} },
    'MyItems-key': { options: {} },
    'Activity-key': { options: {} },
    'Profile-key': { options: {} },
  },
  navigation: {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  },
});

describe('BlurTabBar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all tab labels', () => {
    const BlurTabBar = require('../../../src/components/BlurTabBar').default;
    const props = createTabBarProps();
    const { getByText } = render(<BlurTabBar {...props} />);
    expect(getByText('Home')).toBeTruthy();
    expect(getByText('Saved')).toBeTruthy();
    expect(getByText('My Posts')).toBeTruthy();
    expect(getByText('Inbox')).toBeTruthy();
    expect(getByText('Profile')).toBeTruthy();
  });

  it('navigates on tab press', () => {
    const BlurTabBar = require('../../../src/components/BlurTabBar').default;
    const props = createTabBarProps(0);
    const { getByText } = render(<BlurTabBar {...props} />);
    fireEvent.press(getByText('Saved'));
    expect(props.navigation.navigate).toHaveBeenCalledWith('Saved');
  });

  it('shows badge count on Inbox tab', () => {
    const BlurTabBar = require('../../../src/components/BlurTabBar').default;
    const props = createTabBarProps(0);
    const { getByText } = render(<BlurTabBar {...props} unreadCount={5} />);
    expect(getByText('5')).toBeTruthy();
  });

  it('shows an unnumbered green Home dot and a green unread-message count independently', () => {
    const BlurTabBar = require('../../../src/components/BlurTabBar').default;
    const props = createTabBarProps(0);
    const screen = render(<BlurTabBar {...props} unreadCount={12} hasNewFeed />);
    expect(StyleSheet.flatten(screen.getByTestId('TabBar.Feed.dot').props.style).backgroundColor).toBe(COLORS.success);
    expect(StyleSheet.flatten(screen.getByTestId('TabBar.Activity.badge').props.style).backgroundColor).toBe(COLORS.success);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByTestId('TabBar.Feed').props.accessibilityValue.text).toBe('New posts');
    expect(screen.getByTestId('TabBar.Activity').props.accessibilityValue.text).toBe('12 unread messages');
    screen.rerender(<BlurTabBar {...props} unreadCount={0} hasNewFeed />);
    expect(screen.queryByTestId('TabBar.Activity.badge')).toBeNull();
    expect(screen.getByTestId('TabBar.Feed.dot')).toBeTruthy();
    screen.rerender(<BlurTabBar {...props} unreadCount={120} hasNewFeed={false} />);
    expect(screen.queryByTestId('TabBar.Feed.dot')).toBeNull();
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('does not navigate when pressing active tab', () => {
    const BlurTabBar = require('../../../src/components/BlurTabBar').default;
    const props = createTabBarProps(0);
    const { getByText } = render(<BlurTabBar {...props} />);
    fireEvent.press(getByText('Home'));
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });
});
