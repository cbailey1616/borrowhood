import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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
      { key: 'Inbox-key', name: 'Inbox' },
      { key: 'Profile-key', name: 'Profile' },
    ],
  },
  descriptors: {
    'Feed-key': { options: {} },
    'Saved-key': { options: {} },
    'MyItems-key': { options: {} },
    'Inbox-key': { options: {} },
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
    expect(getByText('Feed')).toBeTruthy();
    expect(getByText('Saved')).toBeTruthy();
    expect(getByText('My Items')).toBeTruthy();
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

  it('does not navigate when pressing active tab', () => {
    const BlurTabBar = require('../../../src/components/BlurTabBar').default;
    const props = createTabBarProps(0);
    const { getByText } = render(<BlurTabBar {...props} />);
    fireEvent.press(getByText('Feed'));
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });
});
