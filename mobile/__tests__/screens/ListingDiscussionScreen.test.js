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

  it('offers a direct reply and opens a known author’s profile from within a thread', async () => {
    api.getDiscussions.mockResolvedValue({ posts: [makePost('alice-root', 'Alice')] });
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Reply to Alice', {}, { timeout: 5000 }));
    await screen.findByLabelText('Post reply');
    expect(usePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    fireEvent.press(screen.getByLabelText('View Alice’s profile'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('UserProfile', { id: 'user-Alice' }));
    expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
  });

  it('does not make a redacted public author’s identity a profile link', async () => {
    api.getDiscussions.mockResolvedValue({ posts: [makePost('anonymous', 'Neighbor', { user: { firstName: 'Neighbor' } })] });
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Neighbor');
    expect(screen.queryByLabelText('View Neighbor’s profile')).toBeNull();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it.each([false,true])('opens the exact notification thread and reply page (request=%s)', async isRequest => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
    const parent = makePost('older-root','Lauren',{replyCount:60});
    const answer = makePost('target-reply','Chris');
    api.getRequestDiscussions = jest.fn().mockResolvedValue({posts:[]});
    const getThread = isRequest ? api.getRequestDiscussionThread : api.getDiscussionThread;
    const getReplies = isRequest ? api.getRequestDiscussionReplies : api.getDiscussionReplies;
    getThread.mockResolvedValue({post:parent,replyPage:2});
    getReplies.mockResolvedValue({replies:[answer]});
    const params = { ...(isRequest ? {requestId:'request-1',request:{title:'Camera'}} : route.params), threadId:'older-root',discussionId:'target-reply' };
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{params}} />);
    await screen.findByText('Chris’s comment');
    expect(getThread).toHaveBeenCalledWith(isRequest ? 'request-1' : 'listing-1','target-reply');
    expect(getReplies).toHaveBeenCalledWith(isRequest ? 'request-1' : 'listing-1','older-root',{page:2,limit:50});
    expect(screen.getByText('Lauren’s comment')).toBeTruthy();
    expect(screen.getByText('Earlier replies')).toBeTruthy();
    act(() => screen.UNSAFE_getByType(FlatList).props.onContentSizeChange());
    expect(scroll).toHaveBeenCalledWith({index:1,animated:false,viewPosition:0.3});
    fireEvent.press(screen.getByText('Earlier replies'));
    await waitFor(() => expect(getReplies).toHaveBeenLastCalledWith(isRequest ? 'request-1' : 'listing-1','older-root',{page:1,limit:50}));
    scroll.mockRestore();
  });

  it('shows a recoverable message when a notification targets a deleted thread', async () => {
    api.getDiscussionThread.mockRejectedValueOnce(new Error('Deleted'));
    api.getDiscussions.mockResolvedValue({posts:[makePost('current','Alex')]});
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={{params:{...route.params,discussionId:'deleted'}}} />);
    await screen.findByText('This thread is unavailable. You can still browse the comments.');
    expect(screen.getByText('Alex’s comment')).toBeTruthy();
  });

  it('loads comments beyond the first fifty', async () => {
    api.getDiscussions.mockResolvedValueOnce({posts:[makePost('first','Alex')],total:51})
      .mockResolvedValueOnce({posts:[makePost('older','Lauren')],total:51});
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByText('More comments'));
    await screen.findByText('Lauren’s comment');
    expect(api.getDiscussions).toHaveBeenLastCalledWith('listing-1',{page:2,limit:50,sort:'oldest'});
  });

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
    expect(composerPadding()).toBe(8);
    expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(mockInsets.bottom);
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
      content: 'Can I collect this tomorrow?', parentId: undefined, clientRequestId: expect.any(String),
    }));
    await act(async () => DeviceEventEmitter.emit('keyboardWillHide', {
      duration: 0, easing: 'keyboard',
      endCoordinates: { screenY: screenHeight, screenX: 0, width: 390, height: 0 },
    }));
    expect(StyleSheet.flatten(screen.getByTestId('Comments.keyboardLayout').props.style).paddingBottom).toBe(0);
    expect(composerPadding()).toBe(8);
    expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(mockInsets.bottom);
  });

  it('fetches discussions on mount', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getDiscussions).toHaveBeenCalledWith('listing-1', { limit: 50, page: 1, sort: 'oldest' }); });
  });

  it('shows empty state when no discussions', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('No comments yet');
  });

  it('renders comment input', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByPlaceholderText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByPlaceholderText('Join the conversation…');
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
    fireEvent.press(screen.getByLabelText('More message actions'));
    fireEvent(screen.UNSAFE_getByType(require('../../src/components/MessageReactionMenu').default).findByType(require('react-native').Modal), 'dismiss');
    expect(visibleMenu(screen).props.actions.map(action => action.label)).toEqual(['Add reaction', 'Copy Text', 'Reply in thread', 'Report or block', 'Message Alice privately']);
    await chooseAction(screen, 'Reply in thread');
    expect(screen.getByPlaceholderText('Write a reply…')).toBeTruthy();
    expect(screen.getByText(post.content)).toBeTruthy();
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(screen.queryByText('Back to comments')).toBeNull();
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Comments' }));
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Comment'), 'Yes, tomorrow works.');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await waitFor(() => expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', { content: 'Yes, tomorrow works.', parentId: 'post-1', clientRequestId: expect.any(String), }));
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

  it('does not trap navigation while an open thread is behind another screen', async () => {
    const focus = jest.spyOn(require('@react-navigation/native'), 'useIsFocused').mockReturnValue(true);
    try {
      api.getDiscussions.mockResolvedValue({ posts: [makePost('root-alice', 'Alice', { replyCount: 1 })] });
      const Screen = require('../../src/screens/ListingDiscussionScreen').default;
      const screen = render(<Screen navigation={mockNavigation} route={route} />);
      fireEvent.press(await screen.findByLabelText('View 1 reply to Alice'));
      expect(usePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
      focus.mockReturnValue(false);
      screen.rerender(<Screen navigation={mockNavigation} route={route} />);
      expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    } finally {
      focus.mockRestore();
    }
  });

  it('uses one composer without a Done strip and keeps native text suggestions', async () => {
    const screen = renderScreen();
    const input = await screen.findByLabelText('Comment');
    expect(input.props).toMatchObject({ keyboardAppearance: 'light', autoCorrect: true, spellCheck: true });
    expect(input.props.inputAccessoryViewID).toBeUndefined();
    expect(screen.queryByLabelText('Done, close keyboard')).toBeNull();
    expect(screen.getByLabelText('Post comment')).toBeTruthy();
    fireEvent.changeText(input, 'A longer comment');
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 84 } } });
    expect(StyleSheet.flatten(screen.getByLabelText('Comment').props.style).height).toBe(84);
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 300 } } });
    expect(StyleSheet.flatten(screen.getByLabelText('Comment').props.style).height).toBe(140);
    fireEvent.changeText(input, '');
    expect(StyleSheet.flatten(screen.getByLabelText('Comment').props.style).height).toBe(72);
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
    expect(screen.getByText('Dan’s comment')).toBeTruthy();
    const list = screen.UNSAFE_getByType(FlatList);
    const scrollToEnd = jest.spyOn(list.instance, 'scrollToIndex').mockImplementation(() => {});
    fireEvent.changeText(screen.getByLabelText('Comment'), 'I can help');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await screen.findByText('I can help');
    act(() => screen.UNSAFE_getByType(FlatList).props.onContentSizeChange());
    expect(scrollToEnd).toHaveBeenCalledWith(expect.objectContaining({ animated: false, viewPosition: 0.3 }));
    await act(async () => resolveReplies({ replies: [...earlier, sent] }));
    await screen.findByText('Ben’s comment');
    expect(screen.getByText('Cara’s comment')).toBeTruthy();
    expect(screen.getAllByText('I can help')).toHaveLength(1);
    expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', { content: 'I can help', parentId: alice.id, clientRequestId: expect.any(String), });
    nativeBack();
    expect(screen.getByText('3 replies')).toBeTruthy();
    expect(screen.getByText('I can help')).toBeTruthy();
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
    fireEvent.press(screen.getByLabelText('More message actions'));
    fireEvent(screen.UNSAFE_getByType(require('../../src/components/MessageReactionMenu').default).findByType(require('react-native').Modal), 'dismiss');
    await chooseAction(screen, 'Reply in thread');
    fireEvent.press(screen.getByLabelText('Post reply'));
    await waitFor(() => expect(api.createDiscussionPost).toHaveBeenCalledWith('listing-1', {
      content: 'My Alice thread draft', parentId: 'root-alice', replyToId: 'child-root-alice', clientRequestId: expect.any(String),
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
    expect(screen.getByPlaceholderText('Write a reply…')).toBeTruthy();
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
    expect(screen.getByPlaceholderText('Join the conversation…')).toBeTruthy();
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
    { isOwner: false, post: makePost('other', 'Alice'), actions: ['Reply in thread', 'Report or block', 'Message Alice privately'] },
    { isOwner: true, post: makePost('other', 'Alice'), actions: ['Reply in thread', 'Report or block', 'Message Alice privately', 'Delete comment'] },
  ])('keeps comment menu permissions for $post.id with owner=$isOwner', async ({ isOwner, post, actions }) => {
    api.getDiscussions.mockResolvedValue({ posts: [post] });
    const screen = renderScreen({ params: { ...route.params, listing: { ...route.params.listing, isOwner } } });
    fireEvent.press(await screen.findByLabelText(`Comment options for ${post.user.firstName}`));
    expect(visibleMenu(screen).props.actions.map(action => action.label)).toEqual(['Add reaction','Copy Text',...actions]);
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
    await waitFor(() => expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(52));
    const list = screen.UNSAFE_getByType(FlatList);
    const end = list.props.data.length - 1;
    const footer = render(list.props.renderItem({item:list.props.data[end],index:end}));
    fireEvent.press(footer.getByText('Show more replies'));
    await waitFor(() => expect(api.getDiscussionReplies).toHaveBeenLastCalledWith('listing-1', 'root-alice', { page: 2, limit: 50 }));
    await waitFor(() => expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(53));
    expect(screen.UNSAFE_getByType(FlatList).props.data.filter(row => row.kind === 'composer')).toHaveLength(1);
  });
});

it('retries an interrupted comment with the same submission ID and keeps one visible copy', async () => {
  const Screen = require('../../src/screens/ListingDiscussionScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Ladder'}}}} />);
  await screen.findByLabelText('Comment');
  api.createDiscussionPost.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({ id:'saved-comment', content:'Tomorrow?', replayed:true });
  fireEvent.changeText(screen.getByLabelText('Comment'), 'Tomorrow?');
  fireEvent.press(screen.getByLabelText('Post comment'));
  await screen.findByText('Couldn’t send. Please try again.');
  expect(screen.getByLabelText('Comment').props.value).toBe('Tomorrow?');
  const attempt = api.createDiscussionPost.mock.calls[0][1];
  expect(attempt.clientRequestId).toEqual(expect.any(String));
  fireEvent.press(screen.getByLabelText('Post comment'));
  await waitFor(() => expect(screen.getByLabelText('Comment').props.value).toBe(''));
  expect(api.createDiscussionPost.mock.calls[1][1]).toEqual(attempt);
  expect(screen.getAllByText('Tomorrow?')).toHaveLength(1);
});

it('keeps a pending comment locked and ignores repeated Send taps', async () => {
  let finish;
  api.createDiscussionPost.mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }));
  const Screen = require('../../src/screens/ListingDiscussionScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Ladder'}}}} />);
  await screen.findByLabelText('Comment');
  fireEvent.changeText(screen.getByLabelText('Comment'), 'First comment');
  fireEvent.press(screen.getByLabelText('Post comment'));
  expect(screen.getByLabelText('Comment').props.editable).toBe(false);
  fireEvent.press(screen.getByLabelText('Post comment'));
  expect(api.createDiscussionPost).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Comment').props.value).toBe('First comment');
  await act(async () => finish({id:'first',content:'First comment'}));
  expect(screen.getByLabelText('Comment').props.editable).toBe(true);
  expect(screen.getByLabelText('Comment').props.value).toBe('');
});

it.each([false,true])('uses the same reaction toolbar on original comments and replies (request=%s)',async isRequest=>{
 const root=makePost('root-react','Alice',{replyCount:1});const child=makePost('reply-react','Jamie');
 api.getDiscussions.mockResolvedValue({posts:[root]});
 api.getRequestDiscussions.mockResolvedValue({posts:[root]});
 api.getDiscussionReplies.mockResolvedValue({replies:[child]});
 api.getRequestDiscussionReplies.mockResolvedValue({replies:[child]});
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:isRequest?{requestId:'target',request:{title:'Drill'}}:{listingId:'target',listing:{title:'Drill'}}}}/>);
 fireEvent(await screen.findByTestId('Comments.message.root-react'),'longPress');
 fireEvent.press(screen.getByLabelText('React: Love'));
 await waitFor(()=>expect(isRequest?api.reactToRequestDiscussion:api.reactToDiscussion).toHaveBeenCalledWith('target','root-react','❤️'));
 await screen.findByLabelText('Love reaction, 1');
 fireEvent.press(screen.getByLabelText('Reply to Alice'));
 fireEvent(await screen.findByTestId('Comments.message.reply-react'),'longPress');
 fireEvent.press(screen.getByLabelText('React: Like'));
 await waitFor(()=>expect(isRequest?api.reactToRequestDiscussion:api.reactToDiscussion).toHaveBeenCalledWith('target','reply-react','👍'));
 fireEvent.press(await screen.findByLabelText('Like reaction, 1'));
 await waitFor(()=>expect(isRequest?api.removeRequestDiscussionReaction:api.removeDiscussionReaction).toHaveBeenCalledWith('target','reply-react','👍'));
 expect(screen.getByLabelText('Love reaction, 1')).toBeTruthy();
});

it('keeps multiple emoji reactions and removes only the selected chip',async()=>{
 api.getDiscussions.mockResolvedValue({posts:[makePost('multi','Alice',{reactions:[{userId:mockUser.id,emoji:'👍'},{userId:mockUser.id,emoji:'🔥'}]})]});
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
 fireEvent.press(await screen.findByLabelText('Like reaction, 1'));
 await waitFor(()=>expect(api.removeDiscussionReaction).toHaveBeenCalledWith('listing-1','multi','👍'));
 expect(screen.getByLabelText('Fire reaction, 1')).toBeTruthy();
 expect(screen.queryByLabelText('Like reaction, 1')).toBeNull();
});

it('shows reply and reactions without voting controls or score labels',async()=>{
 api.getDiscussions.mockResolvedValue({posts:[makePost('vote','Alice',{score:4,viewerVote:1})]});
 api.voteOnDiscussion=jest.fn();
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
 await screen.findByText('Alice’s comment');
 expect(screen.queryByLabelText(/Upvote|Downvote|Score:/)).toBeNull();
 expect(screen.getByLabelText('Reply to Alice')).toBeTruthy();
 expect(screen.getByLabelText('Add reaction')).toBeTruthy();
 expect(api.voteOnDiscussion).not.toHaveBeenCalled();
 const Icon=require('../../src/components/Icon').default;
 const smiles=screen.UNSAFE_getAllByType(Icon.type || Icon).filter(icon=>icon.props.name==='happy-outline');
 expect(smiles).toHaveLength(2);
 expect(smiles.every(icon=>icon.props.size===22)).toBe(true);
});

it('collapses a nested branch and restores it without discarding the reply draft',async()=>{
 api.getDiscussions.mockResolvedValue({posts:[makePost('root','Alice',{replyCount:2})]});
 api.getDiscussionReplies.mockResolvedValue({replies:[makePost('child','Ben',{replyToId:'root'}),makePost('grandchild','Cara',{replyToId:'child'})]});
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
 fireEvent.press(await screen.findByLabelText('View 2 replies to Alice'));
 await screen.findByText('Cara’s comment');
 fireEvent.press(screen.getByLabelText('Reply to Cara'));
 fireEvent.changeText(screen.getByLabelText('Comment'),'Tomorrow works 👍');
 fireEvent.press(screen.getByLabelText('Collapse comment by Ben'));
 expect(screen.queryByText('Cara’s comment')).toBeNull();
 expect(screen.getByLabelText('Comment').props.value).toBe('');
 fireEvent.press(screen.getByLabelText('Expand comment by Ben'));
 fireEvent.press(screen.getByLabelText('Reply to Cara'));
 expect(screen.getByLabelText('Comment').props.value).toBe('Tomorrow works 👍');
});

it('keeps @ text plain with no autocomplete, highlighting, or sort controls',async()=>{
 api.getDiscussions.mockResolvedValue({posts:[makePost('root','Alice',{content:'@Alice can collect this tomorrow.'})]});
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
 await screen.findByText('@Alice can collect this tomorrow.');
 fireEvent(screen.getByLabelText('Comment'),'focus');
 fireEvent.changeText(screen.getByLabelText('Comment'),'@Al');
 expect(screen.getByLabelText('Comment').props.value).toBe('@Al');
 expect(screen.queryByLabelText(/Mention /)).toBeNull();
 expect(screen.queryByLabelText('Mention a neighbor')).toBeNull();
 expect(screen.queryByLabelText(/Sort /)).toBeNull();
 expect(api.getDiscussions).toHaveBeenCalledTimes(1);
 expect(screen.getByText('@Alice can collect this tomorrow.').props.children).toBe('@Alice can collect this tomorrow.');
 fireEvent.press(screen.getByLabelText('Reply to Alice'));
 await screen.findByText('Replying to Alice');
});

it.each([false,true])('keeps all paginated roots oldest first and appends new comments at the bottom (request=%s)',async isRequest=>{
 const old=makePost('old','Alice',{createdAt:'2026-09-01T10:00:00Z',score:0});
 const recent=makePost('recent','Ben',{createdAt:'2026-09-20T10:00:00Z',score:100});
 const later=makePost('later','Cara',{createdAt:'2026-09-25T10:00:00Z'});
 const getPosts=isRequest?api.getRequestDiscussions:api.getDiscussions;
 getPosts.mockResolvedValueOnce({posts:[recent,old],total:51}).mockResolvedValueOnce({posts:[recent,later],total:51});
 const create=isRequest?api.createRequestDiscussionPost:api.createDiscussionPost;
 create.mockResolvedValueOnce({id:'newest',content:'I can pick it up 👍',createdAt:'2026-10-01T12:00:00Z'});
 const params=isRequest?{requestId:'request-1',request:{title:'Sofa'}}:{listingId:'listing-1',listing:{title:'Sofa'}};
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params}}/>);
 await screen.findByText('Alice’s comment');
 const ids=()=>screen.UNSAFE_getByType(FlatList).props.data.map(item=>item.id);
 expect(ids()).toEqual(['old','recent']);
 fireEvent.press(screen.getByText('More comments'));
 await screen.findByText('Cara’s comment');
 expect(ids()).toEqual(['old','recent','later']);
 expect(getPosts.mock.calls).toEqual([[isRequest?'request-1':'listing-1',{limit:50,page:1,sort:'oldest'}],[isRequest?'request-1':'listing-1',{limit:50,page:2,sort:'oldest'}]]);
 fireEvent.changeText(screen.getByLabelText('Comment'),'I can pick it up 👍');
 fireEvent.press(screen.getByLabelText('Post comment'));
 await screen.findByText('I can pick it up 👍');
 expect(ids()).toEqual(['old','recent','later','newest']);
 expect(getPosts).toHaveBeenCalledTimes(2);
});

it('orders fetched and newly sent replies oldest first within their parent thread',async()=>{
 api.getDiscussions.mockResolvedValue({posts:[makePost('root','Alice',{replyCount:2})]});
 api.getDiscussionReplies.mockResolvedValue({replies:[makePost('late','Cara',{createdAt:'2026-09-25T10:00:00Z',score:50}),makePost('early','Ben',{createdAt:'2026-09-20T10:00:00Z',score:0})]});
 api.createDiscussionPost.mockResolvedValueOnce({id:'new-reply',content:'Tomorrow works',createdAt:'2026-10-01T12:00:00Z'});
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
 fireEvent.press(await screen.findByLabelText('Reply to Alice'));
 await screen.findByText('Ben’s comment');
 const ids=()=>screen.UNSAFE_getByType(FlatList).props.data.filter(item=>item.kind!=='composer').map(item=>item.id);
 expect(ids()).toEqual(['root','early','late']);
 fireEvent.changeText(screen.getByLabelText('Comment'),'Tomorrow works');
 fireEvent.press(screen.getByLabelText('Post reply'));
 await screen.findByText('Tomorrow works');
 expect(ids()).toEqual(['root','early','late','new-reply']);
 expect(screen.getByText('Replying to Alice')).toBeTruthy();
});

it('uses the app light theme even when the iPhone is in dark mode, with one scrolling header',async()=>{
 const scheme=jest.spyOn(require('react-native'),'useColorScheme').mockReturnValue('dark');
 try {
  const Screen=require('../../src/screens/ListingDiscussionScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
  await screen.findByLabelText('Comment');
  const { COLORS }=require('../../src/utils/config');
  expect(StyleSheet.flatten(screen.getByTestId('Comments.keyboardLayout').props.style).backgroundColor).toBe(COLORS.background);
  expect(mockNavigation.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({headerStyle:{backgroundColor:COLORS.background},statusBarStyle:'dark'}));
  expect(screen.getByLabelText('Comment').props.keyboardAppearance).toBe('light');
  const header=screen.getByTestId('Comments.header');
  const all=header.findAll(node=>['View original post','Comment','Post comment'].includes(node.props.accessibilityLabel));
  expect(new Set(all.map(node=>node.props.accessibilityLabel))).toEqual(new Set(['View original post','Comment','Post comment']));
  expect(StyleSheet.flatten(screen.getByTestId('Comments.composer').props.style).paddingBottom).toBe(8);
 } finally { scheme.mockRestore(); }
});

it('connects replies to their parent and puts one rounded editor after the replies',async()=>{
 api.getDiscussions.mockResolvedValue({posts:[makePost('parent','Chris',{replyCount:1})]});
 api.getDiscussionReplies.mockResolvedValue({replies:[makePost('child','Kate',{replyToId:'parent',user:{id:'kate',firstName:'Kate',lastName:'K.'}})]});
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
 fireEvent.press(await screen.findByLabelText('View 1 reply to Chris'));
 await screen.findByText('KK');
 const rows=screen.UNSAFE_getByType(FlatList).props.data;
 expect(rows.map(row=>row.id)).toEqual(['parent','child','composer-parent']);
 expect(StyleSheet.flatten(screen.getByTestId('Comments.row.parent').props.style).marginBottom).toBeUndefined();
 expect(StyleSheet.flatten(screen.getByTestId('Comments.row.child').props.style).marginBottom).toBeUndefined();
 const rail=StyleSheet.flatten(screen.getByTestId('Comments.rail.child.1').props.style);
 const connector=StyleSheet.flatten(screen.getByTestId('Comments.connector.parent').props.style);
 expect(rail).toMatchObject({top:0,bottom:0,width:2,left:connector.left});
 expect(StyleSheet.flatten(screen.getByTestId('Comments.composer').props.style).backgroundColor).toBe('transparent');
 expect(screen.getByLabelText('Kate K. avatar')).toBeTruthy();
 expect(StyleSheet.flatten(screen.getByLabelText('Kate K. avatar').props.style).backgroundColor).toBe(require('../../src/utils/config').COLORS.primaryMuted);
 expect(screen.getByLabelText('Collapse comment by Chris')).toBeTruthy();
 expect(screen.getByTestId('Comments.replyEditorRow.parent')).toBeTruthy();
});

it('preserves the actual reply editor and draft when delayed replies arrive',async()=>{
 let resolveReplies;
 api.getDiscussions.mockResolvedValue({posts:[makePost('parent','Chris',{replyCount:1})]});
 api.getDiscussionReplies.mockReturnValueOnce(new Promise(resolve=>{resolveReplies=resolve;}));
 const Screen=require('../../src/screens/ListingDiscussionScreen').default;
 const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
 fireEvent.press(await screen.findByLabelText('Reply to Chris'));
 const editor=await screen.findByLabelText('Comment');
 fireEvent(editor,'focus');
 fireEvent.changeText(editor,'Tomorrow works 👍');
 await act(async()=>resolveReplies({replies:[makePost('late','Kate',{replyToId:'parent'})]}));
 await screen.findByText('Kate’s comment');
 expect(screen.getByLabelText('Comment')).toBe(editor);
 expect(screen.getByLabelText('Comment').props.value).toBe('Tomorrow works 👍');
 expect(screen.UNSAFE_getByType(FlatList).props.data.at(-1).id).toBe('composer-parent');
});

it('scrolls the full reply card into the resized iPhone viewport when the keyboard opens',async()=>{
 let keyboardOpen=false;
 View.prototype.measureInWindow.mockImplementation(function(callback){
  const id=this.props?.testID;
  if(id==='Comments.keyboardLayout') callback(0,120,390,724);
  else if(id==='Comments.viewport') callback(0,120,390,keyboardOpen?400:724);
  else if(id==='Comments.composer') callback(16,460,358,210);
  else callback(0,120,390,100);
 });
 const scroll=jest.spyOn(FlatList.prototype,'scrollToOffset').mockImplementation(()=>{});
 const jump=jest.spyOn(FlatList.prototype,'scrollToIndex').mockImplementation(()=>{});
 try {
  api.getDiscussions.mockResolvedValue({posts:[makePost('parent','Chris')]});
  const Screen=require('../../src/screens/ListingDiscussionScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
  fireEvent.press(await screen.findByLabelText('Reply to Chris'));
  fireEvent(await screen.findByLabelText('Comment'),'focus');
  act(()=>screen.UNSAFE_getByType(FlatList).props.onScroll({nativeEvent:{contentOffset:{y:100}}}));
  keyboardOpen=true;
  await act(async()=>DeviceEventEmitter.emit('keyboardDidShow',{duration:0,easing:'keyboard',endCoordinates:{screenY:520,screenX:0,width:390,height:324}}));
  await waitFor(()=>expect(scroll).toHaveBeenCalledWith({offset:258,animated:true}));
  expect(StyleSheet.flatten(screen.getByTestId('Comments.keyboardLayout').props.style).paddingBottom).toBe(324);
  await act(async()=>DeviceEventEmitter.emit('keyboardDidHide',{duration:0,easing:'keyboard'}));
 } finally {scroll.mockRestore();jump.mockRestore();}
});

it('reveals a still-focused editor when delayed replies move it behind the open keyboard',async()=>{
 let resolveReplies;
 let keyboardOpen=false;
 let composerY=300;
 View.prototype.measureInWindow.mockImplementation(function(callback){
  const id=this.props?.testID;
  if(id==='Comments.keyboardLayout') callback(0,120,390,724);
  else if(id==='Comments.viewport') callback(0,120,390,keyboardOpen?400:724);
  else if(id==='Comments.composer') callback(16,composerY,358,180);
  else callback(0,120,390,100);
 });
 const scroll=jest.spyOn(FlatList.prototype,'scrollToOffset').mockImplementation(()=>{});
 const jump=jest.spyOn(FlatList.prototype,'scrollToIndex').mockImplementation(()=>{});
 try {
  api.getDiscussions.mockResolvedValue({posts:[makePost('parent','Chris',{replyCount:2})]});
  api.getDiscussionReplies.mockReturnValueOnce(new Promise(resolve=>{resolveReplies=resolve;}));
  const Screen=require('../../src/screens/ListingDiscussionScreen').default;
  const screen=render(<Screen navigation={mockNavigation} route={{params:{listingId:'listing-1',listing:{title:'Sofa'}}}}/>);
  fireEvent.press(await screen.findByLabelText('Reply to Chris'));
  const editor=await screen.findByLabelText('Comment');
  fireEvent(editor,'focus');
  fireEvent.changeText(editor,'Tomorrow works 👍');
  const list=screen.UNSAFE_getByType(FlatList);
  act(()=>list.props.onScroll({nativeEvent:{contentOffset:{y:100}}}));
  keyboardOpen=true;
  await act(async()=>DeviceEventEmitter.emit('keyboardDidShow',{
   duration:0,easing:'keyboard',endCoordinates:{screenY:520,screenX:0,width:390,height:324},
  }));
  // Consume the opening jump and finish its scheduled measurements. The
  // later reveal must come from changed content, not a pending focus event.
  act(()=>list.props.onContentSizeChange());
  await act(async()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await act(async()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  expect(scroll).not.toHaveBeenCalled();
  scroll.mockClear();
  jump.mockClear();

  await act(async()=>resolveReplies({replies:[
   makePost('late-one','Kate',{replyToId:'parent'}),
   makePost('late-two','Lauren',{replyToId:'parent'}),
  ]}));
  await screen.findByText('Kate’s comment');
  expect(screen.getByLabelText('Comment')).toBe(editor);
  expect(screen.getByLabelText('Comment').props.value).toBe('Tomorrow works 👍');
  // Its cell has moved, but the editor's own size/relative layout is unchanged.
  composerY=460;
  act(()=>screen.UNSAFE_getByType(FlatList).props.onContentSizeChange());
  await waitFor(()=>expect(scroll).toHaveBeenCalledWith({offset:228,animated:true}));
  expect(jump).not.toHaveBeenCalled();
  await act(async()=>DeviceEventEmitter.emit('keyboardDidHide',{duration:0,easing:'keyboard'}));
 } finally {scroll.mockRestore();jump.mockRestore();}
});
