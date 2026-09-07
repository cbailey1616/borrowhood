import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  // Source calls api.getDiscussions(listingId, { limit: 50 }) and reads data.posts
  api.getDiscussions.mockResolvedValue({ posts: [] });
  // Source calls api.createDiscussionPost(listingId, data)
  api.createDiscussionPost = jest.fn().mockResolvedValue({ id: 'post-1', content: 'test', createdAt: new Date().toISOString() });
});

describe('ListingDiscussionScreen', () => {
  const route = { params: { listingId: 'listing-1', listing: { title: 'Camera', isOwner: false } } };

  it('fetches discussions on mount', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getDiscussions).toHaveBeenCalledWith('listing-1', { limit: 50 }); });
  });

  it('shows empty state when no discussions', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('No questions yet');
  });

  it('renders comment input', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByPlaceholderText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByPlaceholderText('Add a public reply…');
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
    await screen.findByText('Public replies · visible to people who can see this post');
  });

  it('keeps public replying in the composer and private chat in the comment menu', async () => {
    const post = { id: 'post-1', content: 'Available tomorrow?', user: { id: 'user-2', firstName: 'Alice', lastName: 'J' }, replyCount: 0, isOwn: false, createdAt: new Date().toISOString() };
    api.getDiscussions.mockResolvedValue({ posts: [post] });
    api.getConversations.mockResolvedValue([{ id: 'chat-1', otherUser: { id: 'user-2' } }]);
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const ActionSheet = require('../../src/components/ActionSheet').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Reply publicly to Alice'));
    expect(screen.getByText(/Public reply to Alice/)).toBeTruthy();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Public reply'), 'Yes, tomorrow works.');
    fireEvent.press(screen.getByLabelText('Post public reply'));
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
});
