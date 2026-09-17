import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
import ActionSheet from '../../src/components/ActionSheet';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowToast = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: mockShowToast }) }));

const mockRequest = {
  id: 'req-1', title: 'Need a Camera', type: 'item', status: 'open', visibility: 'close_friends',
  category: 'Electronics', description: 'For a photo project',
  isOwner: false,
  requester: { id: 'user-2', firstName: 'Alice', lastName: 'Jones', profilePhotoUrl: null, totalTransactions: 5 },
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks(); api.getRequest.mockResolvedValue(mockRequest); api.getConversations.mockResolvedValue([]);
  api.getRequestOffers.mockResolvedValue([]);
  api.getRequestDiscussions.mockResolvedValue({ posts: [], total: 0 });
  api.withdrawOffer.mockReset().mockResolvedValue({});
  api.deleteRequest.mockReset().mockResolvedValue({});
});

const confirmAction = async screen => {
  const sheet = screen.UNSAFE_getAllByType(ActionSheet).find(item => item.props.isVisible);
  await act(async () => { await sheet.props.actions[0].onPress(); sheet.props.onClose(); });
};

describe('RequestDetailScreen', () => {
  const route = { params: { id: 'req-1' } };

  it.each([undefined, 'conv-existing'])('opens a service reply directly in private chat (%s)', async (conversationId) => {
    const service = { ...mockRequest, type: 'service', title: 'Babysitter' };
    api.getRequest.mockResolvedValue(service);
    api.getConversations.mockResolvedValue(conversationId ? [{ id: conversationId, otherUser: service.requester }] : []);
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('I can help'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', {
      conversationId, recipientId: 'user-2', recipient: service.requester,
      threadContext: { id: 'req-1', type: 'request', requestType: 'service', title: 'Babysitter' },
    }));
    expect(api.getRequest).toHaveBeenCalledTimes(2);
    expect(api.getRequestOffers).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('Private offers')).toBeNull();
    expect(screen.queryByLabelText('Offer an item privately')).toBeNull();
  });

  it.each([
    { status: 'closed' }, { isExpired: true }, { isOwner: true },
    { ownerMasked: true, previewOnly: true, requester: { id: null } },
  ])('rechecks service availability before opening a private reply: %j', async (changed) => {
    api.getRequest.mockResolvedValueOnce({ ...mockRequest, type: 'service' })
      .mockResolvedValue({ ...mockRequest, type: 'service', ...changed });
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('I can help'));
    await screen.findByText('This wanted post is no longer accepting replies.');
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(api.getConversations).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('I can help')).toBeNull();
  });

  it('lets a service responder retry if opening chat fails', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, type: 'service' });
    api.getConversations.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('I can help'));
    await screen.findByText('Couldn’t open chat. Please try again.');
    expect(screen.getByLabelText('I can help')).not.toBeDisabled();
    fireEvent.press(screen.getByLabelText('I can help'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', expect.anything()));
    expect(screen.queryByText('Couldn’t open chat. Please try again.')).toBeNull();
  });

  it('shows an expired request honestly and does not offer an action that will fail', async () => {
    api.getRequest.mockResolvedValueOnce({ ...mockRequest, isExpired: true });
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Expired');
    expect(screen.queryByLabelText('Offer an item privately')).toBeNull();
    expect(screen.getByText('No longer accepting offers.')).toBeTruthy();
  });

  it('fetches request via api.getRequest', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getRequest).toHaveBeenCalledWith('req-1'); });
  });

  it('displays request title', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Need a Camera');
  });

  it('displays status badge', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/open/i);
  });

  it('displays requester info', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Alice/);
  });

  it('non-owner can offer one item privately', async () => {
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByLabelText } = render(<Screen navigation={mockNavigation} route={route} />);
    const offer = await findByLabelText('Offer an item privately');
    fireEvent.press(offer);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('OfferItem', expect.anything());
  });

  it('owner sees edit and close buttons', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, isOwner: true, requester: { ...mockRequest.requester, id: 'user-1' } });
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText(/Edit/i);
  });

  it('keeps a closed request’s private offer accessible without empty comments or new-offer actions', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, status: 'closed' });
    const title = 'A camera with a spare battery, travel case and an extra long lens for wildlife photos';
    api.getRequestOffers.mockResolvedValue([{ id: 'camera', title, isOwn: true }]);
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    const offer = await screen.findByLabelText(`View offered item: ${title}`);
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.queryByText('Comments')).toBeNull();
    expect(screen.queryByLabelText('Offer an item privately')).toBeNull();
    expect(screen.queryByText(/transactions/)).toBeNull();
    fireEvent.press(offer);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDetail', { id: 'camera' });
    fireEvent.press(screen.getByLabelText(`Withdraw offer: ${title}`));
    expect(api.withdrawOffer).not.toHaveBeenCalled();
    await confirmAction(screen);
    expect(api.withdrawOffer).toHaveBeenCalledWith('req-1', 'camera');
    expect(screen.queryByText(title)).toBeNull();
    expect(screen.queryByText('Private offers')).toBeNull();
  });

  it('keeps an offer visible if withdrawing fails and allows retry', async () => {
    api.getRequestOffers.mockResolvedValue([{ id: 'camera', title: 'Camera', isOwn: true }]);
    api.withdrawOffer.mockRejectedValueOnce(new Error('Offline'));
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Withdraw offer: Camera'));
    await confirmAction(screen);
    expect(mockShowToast).toHaveBeenCalledWith('Couldn’t withdraw the offer. Please try again.', 'error');
    expect(screen.getByText('Camera')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Withdraw offer: Camera'));
    await confirmAction(screen);
    expect(screen.queryByText('Camera')).toBeNull();
  });

  it('retains existing comments on closed requests without offering a new comment', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, status: 'closed' });
    api.getRequestDiscussions.mockResolvedValue({ posts: [{ id: 'comment', content: 'I have a camera you can use.', user: { firstName: 'Sam' }, replyCount: 2 }], total: 4 });
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    await screen.findByText('Comments (4)');
    expect(screen.queryByLabelText('Add a comment')).toBeNull();
    fireEvent.press(screen.getByLabelText('View all comments'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ListingDiscussion', expect.objectContaining({ requestId: 'req-1' }));
  });

  it('shows an offer load failure honestly and can retry', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, status: 'closed' });
    api.getRequestOffers.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([{ id: 'camera', title: 'Camera', isOwn: false }]);
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Couldn’t load offers. Try again'));
    await screen.findByLabelText('View offered item: Camera');
    expect(screen.queryByLabelText('Withdraw offer: Camera')).toBeNull();
  });

  it('opens the full photo and preserves the requester rank without opening the profile', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, photoUrl: 'https://example.com/camera.jpg', requester: { ...mockRequest.requester, isVerified: true, endorsement: { completedCount: 6, score: 85 } } });
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('View full wanted photo'));
    expect(screen.getByLabelText('Full wanted photo')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close photo'));
    expect(screen.queryByLabelText('Close photo')).toBeNull();
    const stopPropagation = jest.fn();
    fireEvent.press(screen.getByLabelText('Neighbor rank: Archer'), { stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(screen.getByText('Rating levels')).toBeTruthy();
  });

  it('requires confirmation before closing and preserves the page on failure', async () => {
    api.getRequest.mockResolvedValue({ ...mockRequest, isOwner: true });
    api.deleteRequest.mockRejectedValueOnce(new Error('Offline'));
    const Screen = require('../../src/screens/RequestDetailScreen').default;
    const screen = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.press(await screen.findByLabelText('Close post'));
    expect(api.deleteRequest).not.toHaveBeenCalled();
    await confirmAction(screen);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('Couldn’t close the post. Please try again.', 'error');
    fireEvent.press(screen.getByLabelText('Close post'));
    await confirmAction(screen);
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});

it.each([true, false])('explains preview-only Town identity without private actions (ownerMasked=%s)', async ownerMasked => {
  api.getRequest.mockResolvedValue({ ...mockRequest, ownerMasked, previewOnly: true, requester: { id: null, firstName: 'Town', lastName: 'neighbor' } });
  const Screen = require('../../src/screens/RequestDetailScreen').default;
  const screen = render(<Screen navigation={mockNavigation} route={{ params: { id: 'req-1' } }} />);
  await screen.findByText('Need a Camera');
  expect(api.getRequestDiscussions).not.toHaveBeenCalled();
  expect(api.getRequestOffers).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Offer an item privately')).toBeNull();
  fireEvent.press(screen.getByLabelText('Identity hidden. Get verified to see who’s sharing'));
  expect(mockNavigation.navigate).toHaveBeenCalledWith('IdentityVerification', { source: 'town_browse' });
});
