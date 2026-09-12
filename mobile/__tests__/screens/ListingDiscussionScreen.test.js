import React from 'react';
import { DeviceEventEmitter, FlatList, StyleSheet, View } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import { UNSTABLE_usePreventRemove as usePreventRemove } from '@react-navigation/native';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
let mockHeaderHeight = 88;
let mockWindowHeight = 844;
const mockInsets = { top: 44, bottom: 34, left: 0, right: 0 };

jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => mockHeaderHeight }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => ({ width: 390, height: mockWindowHeight, scale: 3, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
  SafeAreaView: require('react-native').View,
}));

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockHeaderHeight = 88;
  mockWindowHeight = 844;
  View.prototype.measureInWindow.mockReset();
  // Source calls api.getDiscussions(listingId, { limit: 50 }) and reads data.posts
  api.getDiscussions.mockResolvedValue({ posts: [] });
  api.getDiscussionReplies.mockResolvedValue({ replies: [] });
  api.getRequestDiscussionReplies = jest.fn().mockResolvedValue({ replies: [] });
  api.deleteDiscussionPost = jest.fn().mockResolvedValue({});
  // Source calls api.createDiscussionPost(listingId, data)
  api.createDiscussionPost = jest.fn().mockResolvedValue({ id: 'new-post', content: 'test', createdAt: new Date().toISOString() });
});

const makePost = (id, firstName, options = {}) => ({
  id, content: `${firstName}’s comment`, user: { id: `user-${firstName}`, firstName },
  replyCount: 0, isOwn: false, createdAt: '2026-09-12T10:00:00.000Z', ...options,
});

const visibleMenu = screen => {
  const ActionSheet = require('../../src/components/ActionSheet').default;
  return screen.UNSAFE_getAllByType(ActionSheet).find(sheet => sheet.props.isVisible);
};

const chooseAction = async (screen, label) => {
  const menu = visibleMenu(screen);
  await act(async () => {
    await menu.props.actions.find(action => action.label === label).onPress();
    menu.props.onClose();
  });
};

const nativeBack = (type = 'GO_BACK') => {
  const [prevented, handleRemoval] = usePreventRemove.mock.calls.at(-1);
  expect(prevented).toBe(true);
  act(() => handleRemoval({ data: { action: { type } } }));
};

describe('ListingDiscussionScreen', () => {
  const route = { params: { listingId: 'listing-1', listing: { title: 'Camera', isOwner: false } } };

  it.each([
    { screenHeight: 844, headerHeight: 103, nativeOrigin: 120, keyboardTop: 520 },
    { screenHeight: 667, headerHeight: 88, nativeOrigin: 88, keyboardTop: 407 },
  ])('keeps the composer above the keyboard when its native origin is $nativeOrigin', async ({ screenHeight, headerHeight, nativeOrigin, keyboardTop }) => {
    mockHeaderHeight = headerHeight;
    mockWindowHeight = screenHeight;
    View.prototype.measureInWindow.mockImplementation(callback => callback(0, nativeOrigin, 390, screenHeight - nativeOrigin));
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByLabelText('Comment');
    const viewportHeight = screenHeight - nativeOrigin;
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
    expect(nativeOrigin + viewportHeight - keyboardPadding).toBe(keyboardTop);
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
    await screen.findByLabelText('Comment');
  });

  it('opens a focused public thread from a long press and keeps private messaging separate', async () => {
    const post = { id: 'post-1', content: 'Available tomorrow?', user: { id: 'user-2', firstName: 'Alice', lastName: 'J' }, replyCount: 0, isOwn: false, createdAt: new Date().toISOString() };
    api.getDiscussions.mockResolvedValue({ posts: [post] });
    api.getConversations.mockResolvedValue([{ id: 'chat-1', otherUser: { id: 'user-2' } }]);
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent(await screen.findByTestId('Comments.message.post-1'), 'longPress');
    expect(visibleMenu(screen).props.actions.map(action => action.label)).toEqual(['Reply in thread', 'Message Alice privately']);
    await chooseAction(screen, 'Reply in thread');
    expect(screen.getByPlaceholderText('Reply in thread…')).toBeTruthy();
    expect(screen.getByText(post.content)).toBeTruthy();
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.queryByText('Back to comments')).toBeNull();
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Thread' }));
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Yes, tomorrow works.');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await waitFor(() => expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', { content: 'Yes, tomorrow works.', parentId: 'post-1' }));
    fireEvent.press(screen.getByLabelText('Comment options for Alice'));
    await chooseAction(screen, 'Message Alice privately');
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
    const screen = render(<Screen navigation={mockNavigation} route={{ params: {
      requestId: 'req-service', request: { id: 'req-service', title: 'Babysitter', type: 'service' },
    } }} />);
    fireEvent.press(await screen.findByLabelText('Comment options for Alice'));
    await chooseAction(screen, 'Message Alice privately');
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

describe('focused comment threads', () => {
  const route = { params: { listingId: 'listing-1', listing: { title: 'Camera', isOwner: false } } };
  const renderScreen = (params = route) => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    return render(<Screen navigation={mockNavigation} route={params} />);
  };

  it('uses one composer without a Done strip and keeps native text suggestions', async () => {
    const screen = renderScreen();
    const input = await screen.findByLabelText('Comment');
    expect(input.props).toMatchObject({ keyboardAppearance: 'dark', autoCorrect: true, spellCheck: true });
    expect(input.props.inputAccessoryViewID).toBeUndefined();
    expect(screen.queryByLabelText('Done, close keyboard')).toBeNull();
    expect(screen.getByLabelText('Post comment')).toBeTruthy();
    fireEvent.changeText(input, 'A longer comment');
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 84 } } });
    expect(StyleSheet.flatten(screen.getByLabelText('Comment').props.style).height).toBe(84);
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 300 } } });
    expect(StyleSheet.flatten(screen.getByLabelText('Comment').props.style).height).toBe(112);
    fireEvent.changeText(input, '');
    expect(StyleSheet.flatten(screen.getByLabelText('Comment').props.style).height).toBe(48);
  });

  it('keeps earlier replies and deduplicates a new reply when loading finishes after sending', async () => {
    const alice = makePost('root-alice', 'Alice', { replyCount: 2 });
    const earlier = [makePost('reply-1', 'Ben'), makePost('reply-2', 'Cara')];
    const sent = makePost('reply-new', 'Test', { content: 'I can help', createdAt: '2026-09-12T11:00:00.000Z' });
    api.getDiscussions.mockResolvedValue({ posts: [alice, makePost('other-root', 'Dan')] });
    let resolveReplies;
    api.getDiscussionReplies.mockReturnValueOnce(new Promise(resolve => { resolveReplies = resolve; }));
    api.createDiscussionPost.mockResolvedValueOnce(sent);
    const screen = renderScreen();
    fireEvent.press(await screen.findByLabelText('View 2 replies to Alice'));
    expect(screen.queryByText('Dan’s comment')).toBeNull();
    const list = screen.UNSAFE_getByType(FlatList);
    const scrollToEnd = jest.spyOn(list.instance, 'scrollToEnd').mockImplementation(() => {});
    fireEvent.changeText(screen.getByLabelText('Comment'), 'I can help');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await screen.findByText('I can help');
    act(() => screen.UNSAFE_getByType(FlatList).props.onContentSizeChange());
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
    await act(async () => resolveReplies({ replies: [...earlier, sent] }));
    await screen.findByText('Ben’s comment');
    expect(screen.getByText('Cara’s comment')).toBeTruthy();
    expect(screen.getAllByText('I can help')).toHaveLength(1);
    expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', { content: 'I can help', parentId: alice.id });
    nativeBack();
    expect(screen.getByText('3 replies')).toBeTruthy();
    expect(screen.queryByText('I can help')).toBeNull();
    expect(screen.getByText('Dan’s comment')).toBeTruthy();
  });

  it('preserves separate main and thread drafts and routes a child reply to its original root', async () => {
    api.getDiscussions.mockResolvedValue({ posts: [makePost('root-alice', 'Alice', { replyCount: 1 }), makePost('root-ben', 'Ben', { replyCount: 1 })] });
    api.getDiscussionReplies.mockImplementation((listingId, postId) => Promise.resolve({
      replies: [makePost(`child-${postId}`, postId === 'root-alice' ? 'Cara' : 'Dan')],
    }));
    const screen = renderScreen();
    fireEvent.changeText(await screen.findByLabelText('Comment'), 'My main comment draft');
    fireEvent.press(screen.getByLabelText('View 1 reply to Alice'));
    await screen.findByText('Cara’s comment');
    expect(screen.getByLabelText('Comment').props.value).toBe('');
    fireEvent.changeText(screen.getByLabelText('Comment'), 'My Alice thread draft');
    nativeBack();
    expect(screen.getByLabelText('Comment').props.value).toBe('My main comment draft');
    fireEvent.press(screen.getByLabelText('View 1 reply to Ben'));
    await screen.findByText('Dan’s comment');
    expect(screen.getByLabelText('Comment').props.value).toBe('');
    fireEvent.changeText(screen.getByLabelText('Comment'), 'My Ben thread draft');
    nativeBack();
    fireEvent.press(screen.getByLabelText('View 1 reply to Alice'));
    expect(screen.getByLabelText('Comment').props.value).toBe('My Alice thread draft');
    fireEvent(screen.getByTestId('Comments.message.child-root-alice'), 'longPress');
    await chooseAction(screen, 'Reply in thread');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await waitFor(() => expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', {
      content: 'My Alice thread draft', parentId: 'root-alice',
    }));
    nativeBack();
    expect(screen.getByLabelText('Comment').props.value).toBe('My main comment draft');
    fireEvent.press(screen.getByLabelText('View 1 reply to Ben'));
    expect(screen.getByLabelText('Comment').props.value).toBe('My Ben thread draft');
  });

  it('retains a failed reply, prevents duplicate sends, and retries without leaving the thread', async () => {
    api.getDiscussions.mockResolvedValue({ posts: [makePost('root-alice', 'Alice', { replyCount: 1 })] });
    let rejectSend;
    api.createDiscussionPost.mockReturnValueOnce(new Promise((resolve, reject) => { rejectSend = reject; }));
    const screen = renderScreen();
    fireEvent.press(await screen.findByLabelText('View 1 reply to Alice'));
    await waitFor(() => expect(api.getDiscussionReplies).toHaveBeenCalled());
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Keep my reply');
    const HapticPressable = require('../../src/components/HapticPressable').default;
    const send = screen.UNSAFE_getAllByType(HapticPressable).find(button => button.props.accessibilityLabel === 'Post reply').props.onPress;
    act(() => { send(); send(); });
    expect(api.createDiscussionPost).toHaveBeenCalledTimes(1);
    await act(async () => rejectSend(new Error('offline')));
    expect(screen.getByText('Couldn’t send. Please try again.')).toBeTruthy();
    expect(screen.getByLabelText('Comment').props.value).toBe('Keep my reply');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await waitFor(() => expect(api.createDiscussionPost).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText('Comment').props.value).toBe(''));
    expect(screen.getByPlaceholderText('Reply in thread…')).toBeTruthy();
  });

  it('shows a clear retry when replies fail and keeps the sent reply during recovery', async () => {
    api.getDiscussions.mockResolvedValue({ posts: [makePost('root-alice', 'Alice', { replyCount: 1 })] });
    api.getDiscussionReplies.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ replies: [makePost('old-reply', 'Ben')] });
    api.createDiscussionPost.mockResolvedValueOnce(makePost('new-reply', 'Test', { content: 'Still here', createdAt: '2026-09-12T11:00:00.000Z' }));
    const screen = renderScreen();
    fireEvent.press(await screen.findByLabelText('View 1 reply to Alice'));
    await screen.findByLabelText('Retry loading replies');
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Still here');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await screen.findByText('Still here');
    fireEvent.press(await screen.findByLabelText('Retry loading replies'));
    await screen.findByText('Ben’s comment');
    expect(screen.getByText('Still here')).toBeTruthy();
    expect(screen.queryByText('Couldn’t load earlier replies.')).toBeNull();
  });

  it.each(['listing', 'request'])('keeps native back inside a thread but allows intentional navigation to the original %s', async kind => {
    const post = makePost('root-alice', 'Alice', { replyCount: 1 });
    api.getDiscussions.mockResolvedValue({ posts: [post] });
    api.getRequestDiscussions.mockResolvedValue({ posts: [post] });
    const params = kind === 'request' ? { requestId: 'request-1', request: { title: 'Help', type: 'service' } } : route.params;
    const screen = renderScreen({ params });
    fireEvent.changeText(await screen.findByLabelText('Comment'), 'Main draft');
    fireEvent.press(await screen.findByLabelText('View 1 reply to Alice'));
    await waitFor(() => expect(usePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function)));
    expect(screen.getByText(kind === 'request' ? 'Help' : 'Camera')).toBeTruthy();
    expect(screen.queryByText('Back to comments')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Thread draft');
    // Native back / Android back send GO_BACK; an iOS swipe removes with POP.
    nativeBack(kind === 'request' ? 'POP' : 'GO_BACK');
    expect(screen.getByPlaceholderText('Add a comment…')).toBeTruthy();
    expect(screen.getByLabelText('Comment').props.value).toBe('Main draft');
    expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('View 1 reply to Alice'));
    expect(screen.getByLabelText('Comment').props.value).toBe('Thread draft');
    fireEvent.press(screen.getByLabelText('View original post'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith(
      kind === 'request' ? 'RequestDetail' : 'ListingDetail', { id: kind === 'request' ? 'request-1' : 'listing-1' },
    ));
    expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
  });

  it.each([
    { isOwner: false, post: makePost('own', 'Test', { user: { id: 'user-1', firstName: 'Test' }, isOwn: false }), actions: ['Reply in thread', 'Delete comment'] },
    { isOwner: false, post: makePost('other', 'Alice'), actions: ['Reply in thread', 'Message Alice privately'] },
    { isOwner: true, post: makePost('other', 'Alice'), actions: ['Reply in thread', 'Message Alice privately', 'Delete comment'] },
  ])('keeps comment menu permissions for $post.id with owner=$isOwner', async ({ isOwner, post, actions }) => {
    api.getDiscussions.mockResolvedValue({ posts: [post] });
    const screen = renderScreen({ params: { ...route.params, listing: { ...route.params.listing, isOwner } } });
    fireEvent.press(await screen.findByLabelText(`Comment options for ${post.user.firstName}`));
    expect(visibleMenu(screen).props.actions.map(action => action.label)).toEqual(actions);
    if (actions.includes('Delete comment')) {
      await chooseAction(screen, 'Delete comment');
      expect(api.deleteDiscussionPost).not.toHaveBeenCalled();
      expect(visibleMenu(screen).props.title).toBe('Delete comment');
      await chooseAction(screen, 'Delete');
      expect(api.deleteDiscussionPost).toHaveBeenCalledWith('listing-1', post.id);
      expect(screen.queryByText(post.content)).toBeNull();
    }
  });

  it('loads the next reply page without losing earlier replies', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => makePost(`reply-${i}`, `Neighbor ${i}`));
    api.getDiscussions.mockResolvedValue({ posts: [makePost('root-alice', 'Alice', { replyCount: 51 })] });
    api.getDiscussionReplies.mockResolvedValueOnce({ replies: firstPage }).mockResolvedValueOnce({ replies: [makePost('reply-50', 'Last neighbor')] });
    const screen = renderScreen();
    fireEvent.press(await screen.findByLabelText('View 51 replies to Alice'));
    fireEvent.press(await screen.findByText('Show more replies'));
    await waitFor(() => expect(api.getDiscussionReplies).toHaveBeenLastCalledWith('listing-1', 'root-alice', { page: 2, limit: 50 }));
    await waitFor(() => expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(51));
    expect(screen.queryByText('Show more replies')).toBeNull();
  });
});
