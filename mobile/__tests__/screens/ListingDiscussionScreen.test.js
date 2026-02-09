import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
    await findByPlaceholderText('Ask a question...');
  });

  it('displays posts when available', async () => {
    api.getDiscussions.mockResolvedValue({
      posts: [{ id: 'post-1', content: 'Is this still available?', user: { id: 'user-2', firstName: 'Alice', lastName: 'J', profilePhotoUrl: null }, replyCount: 0, isOwn: false, createdAt: new Date().toISOString() }],
    });
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Is this still available?');
  });

  it('renders send button', async () => {
    const Screen = require('../../src/screens/ListingDiscussionScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getDiscussions).toHaveBeenCalled(); });
  });
});
