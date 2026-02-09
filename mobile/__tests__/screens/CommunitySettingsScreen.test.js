import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getCommunity.mockResolvedValue({ id: 'comm-1', name: 'Test Hood', description: 'A neighborhood' }); });
describe('CommunitySettingsScreen', () => {
  const route = { params: { id: 'comm-1' } };
  it('fetches community details', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    render(<Screen navigation={mockNavigation} route={route} />);
    await waitFor(() => { expect(api.getCommunity).toHaveBeenCalledWith('comm-1'); });
  });
  it('displays community name', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Test Hood');
  });
  it('shows invite neighbors option', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Invite Neighbors');
  });
  it('shows leave neighborhood button', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('Leave Neighborhood');
  });
  it('shows notification toggles', async () => {
    const Screen = require('../../src/screens/CommunitySettingsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} route={route} />);
    await findByText('New Items');
    await findByText('Messages');
  });
});
