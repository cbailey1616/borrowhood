import React from 'react';
import { DeviceEventEmitter, StyleSheet } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
let mockHeaderHeight = 88;
const mockInsets = { top: 44, bottom: 34, left: 0, right: 0 };

jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => mockHeaderHeight }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
  SafeAreaView: require('react-native').View,
}));

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockHeaderHeight = 88;
  // Source calls api.getDiscussions(listingId, { limit: 50 }) and reads data.posts
  api.getDiscussions.mockResolvedValue({ posts: [] });
  // Source calls api.createDiscussionPost(listingId, data)
  api.createDiscussionPost = jest.fn().mockResolvedValue({ id: 'post-1', content: 'test', createdAt: new Date().toISOString() });
});

describe('ListingDiscussionScreen', () => {
  const route = { params: { listingId: 'listing-1', listing: { title: 'Camera', isOwner: false } } };

  it.each([
    { screenHeight: 844, headerHeight: 113, keyboardTop: 520 },
    { screenHeight: 667, headerHeight: 88, keyboardTop: 407 },
  ])('keeps the composer above the keyboard with a $headerHeight-point header', async ({ screenHeight, headerHeight, keyboardTop }) => {
    mockHeaderHeight = headerHeight;
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByLabelText('Comment');
    const viewportHeight = screenHeight - headerHeight;
    await act(async () => fireEvent(screen.getByTestId('Comments.keyboardLayout'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: viewportHeight } },
      persist: jest.fn(),
    }));
    const composerPadding = () => StyleSheet.flatten(screen.getByTestId('Comments.composer').props.style).paddingBottom;
    expect(composerPadding()).toBeGreaterThanOrEqual(mockInsets.bottom);
    await act(async () => DeviceEventEmitter.emit('keyboardWillShow', {
      duration: 0, easing: 'keyboard',
      endCoordinates: { screenY: keyboardTop, screenX: 0, width: 390, height: screenHeight - keyboardTop },
    }));
    const keyboardPadding = StyleSheet.flatten(screen.getByTestId('Comments.keyboardLayout').props.style).paddingBottom;
    expect(headerHeight + viewportHeight - keyboardPadding).toBe(keyboardTop);
    expect(composerPadding()).toBeGreaterThanOrEqual(8);
    expect(composerPadding()).toBeLessThanOrEqual(12);
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Can I collect this tomorrow?');
    fireEvent.press(screen.getByLabelText('Post comment'));
    await waitFor(() => expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', {
      content: 'Can I collect this tomorrow?', parentId: undefined,
    }));
    await act(async () => DeviceEventEmitter.emit('keyboardWillHide', {
      duration: 0, easing: 'keyboard',
      endCoordinates: { screenY: screenHeight, screenX: 0, width: 390, height: 0 },
    }));
    expect(StyleSheet.flatten(screen.getByTestId('Comments.keyboardLayout').props.style).paddingBottom).toBe(0);
    expect(composerPadding()).toBeGreaterThanOrEqual(mockInsets.bottom);
  });

  it('fetches discussions on mount', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getDiscussions).toHaveBeenCalledWith('listing-1', { limit: 50 }); });
  });

  it('shows empty state when no discussions', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('No comments yet');
  });

  it('renders comment input', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByPlaceholderText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByPlaceholderText('Add a comment…');
  });

  it('displays posts when available', async () => {
    api.getDiscussions.mockResolvedValue({
      posts: [{ id: 'post-1', content: 'Is this still available?', user: { id: 'user-2', firstName: 'Alice', lastName: 'J', profilePhotoUrl: null }, replyCount: 0, isOwn: false, createdAt: new Date().toISOString() }],
    });
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Is this still available?');
  });

  it('loads the original title when opened from Activity with only an ID', async () => {
    api.getListing.mockResolvedValueOnce({ id: 'listing-1', title: 'Garden ladder' });
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: { listingId: 'listing-1' } }} />);
    await screen.findByText('Garden ladder');
    await screen.findByText('Visible to people who can see this post.');
  });

  it('keeps public replying in the composer and private chat in the comment menu', async () => {
    const post = { id: 'post-1', content: 'Available tomorrow?', user: { id: 'user-2', firstName: 'Alice', lastName: 'J' }, replyCount: 0, isOwn: false, createdAt: new Date().toISOString() };
    api.getDiscussions.mockResolvedValue({ posts: [post] });
    api.getConversations.mockResolvedValue([{ id: 'chat-1', otherUser: { id: 'user-2' } }]);
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const ActionSheet = require('../../src/components/ActionSheet').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Reply to Alice'));
    expect(screen.getByText(/Replying to Alice/)).toBeTruthy();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Yes, tomorrow works.');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await waitFor(() => expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', { content: 'Yes, tomorrow works.', parentId: 'post-1' }));
    fireEvent.press(screen.getByLabelText('Comment options for Alice'));
    const menu = screen.UNSAFE_getAllByType(ActionSheet).find(sheet => sheet.props.isVisible);
    expect(menu.props.actions.map(action => action.label)).toEqual(['Message Alice privately']);
    await act(async () => menu.props.actions[0].onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'chat-1', recipientId: 'user-2', threadContext: expect.objectContaining({ id: 'listing-1', replyText: post.content }) }));
  });

  it('renders send button', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getDiscussions).toHaveBeenCalled(); });
  });

  it('keeps service context when messaging someone from a request comment', async () => {
    const post = { id: 'post-1', content: 'I can babysit', user: { id: 'user-2', firstName: 'Alice' }, replyCount: 0, isOwn: false };
    api.getRequestDiscussions.mockResolvedValue({ posts: [post] });
    api.getConversations.mockResolvedValue([]);
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const ActionSheet = require('../../src/components/ActionSheet').default;
    const screen = render(<Screen navigation={mockNavigation} route={{ params: {
      requestId: 'req-service', request: { id: 'req-service', title: 'Babysitter', type: 'service' },
    } }} />);
    fireEvent.press(await screen.findByLabelText('Comment options for Alice'));
    const menu = screen.UNSAFE_getAllByType(ActionSheet).find(sheet => sheet.props.isVisible);
    await act(async () => menu.props.actions[0].onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({
      recipientId: 'user-2', threadContext: {
        id: 'req-service', title: 'Babysitter', type: 'request', requestType: 'service', replyText: post.content,
      },
    }));
  });
});

it.each(['listing', 'request'])('uses the display name immediately after posting a %s comment', async kind => {
  const result = { id: 'display-post', content: 'Available tomorrow?', createdAt: new Date().toISOString(), user: { id: 'user-1', firstName: 'GardenNeighbor', lastName: '' } };
  api.createDiscussionPost.mockResolvedValueOnce(result);
  api.createRequestDiscussionPost = jest.fn().mockResolvedValue(result);
  api.getRequestDiscussions = jest.fn().mockResolvedValue({ posts: [] });
  const Screen = require('../../src/screens/ListingDiscussionScreen').default;
  const params = kind === 'request' ? { requestId: 'request-1', request: { title: 'Help', type: 'service' } } : { listingId: 'listing-1', listing: { title: 'Camera' } };
  const screen = render(<Screen route={{ params }} navigation={mockNavigation} />);
  fireEvent.changeText(await screen.findByLabelText('Comment'), 'Available tomorrow?');
  fireEvent.press(screen.getByLabelText('Post comment'));
  await screen.findByText('GardenNeighbor');
  expect(screen.queryByText('Test User')).toBeNull();
});
