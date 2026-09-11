import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCommunities.mockResolvedValue([]); api.getCommunityMembers.mockResolvedValue([]); });
describe('MyCommunityScreen', () => {
  it('hides legacy pinned announcements and uses member display names', async () => {
    api.getCommunities.mockResolvedValue([{ id: 'c', name: 'Our neighborhood', announcement: 'Old pinned note' }]);
    api.getCommunityMembers.mockResolvedValue([{ id: 'u', displayName: 'Friendly Neighbor', firstName: 'LEGAL NAME', role: 'organizer' }]);
    const Screen = require('../../src/screens/MyCommunityScreen').default;
    const { findByText, queryByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Friendly Neighbor');
    expect(queryByText('Old pinned note')).toBeNull();
    expect(queryByText('Pinned')).toBeNull();
    expect(queryByText('Neighborhood organizer')).toBeTruthy();
  });
  it('fetches communities on mount', async () => {
    const Screen = require('../../src/screens/MyCommunityScreen').default;
    render(<Screen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getCommunities).toHaveBeenCalledWith(expect.objectContaining({ member: 'true' })); });
  });
  it('shows empty state when no community', async () => {
    const Screen = require('../../src/screens/MyCommunityScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText(/No Neighborhood/i);
  });
  it('displays community info', async () => {
    api.getCommunities.mockResolvedValue([{ id: 'comm-1', name: 'Test Hood', description: 'A neighborhood', memberCount: 25, listingCount: 10, imageUrl: null }]);
    api.getCommunityMembers.mockResolvedValue([{ id: 'user-1', firstName: 'Test', lastName: 'User', profilePhotoUrl: null, role: 'member' }]);
    const Screen = require('../../src/screens/MyCommunityScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Test Hood');
  });
  it('shows invite neighbors button', async () => {
    api.getCommunities.mockResolvedValue([{ id: 'comm-1', name: 'Test Hood', description: 'A neighborhood', memberCount: 25, listingCount: 10, imageUrl: null }]);
    api.getCommunityMembers.mockResolvedValue([]);
    const Screen = require('../../src/screens/MyCommunityScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Invite Neighbors');
  });
  it('opens member management directly for neighborhood moderators', async () => {
    api.getCommunities.mockResolvedValue([{ id: 'comm-1', name: 'Test Hood', role: 'organizer' }]);
    api.getCommunityMembers.mockResolvedValue([{ id: 'user-1', firstName: 'Test', role: 'organizer' }]);
    const Screen = require('../../src/screens/MyCommunityScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    fireEvent.press(await findByText('Manage'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CommunityMembers', { id: 'comm-1', role: 'organizer' });
  });
});
