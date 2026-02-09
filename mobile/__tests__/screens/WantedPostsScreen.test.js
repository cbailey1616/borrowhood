import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.getRequests.mockResolvedValue([]);
});

describe('WantedPostsScreen', () => {
  it('fetches requests on mount', async () => {
    const Screen = require('../../src/screens/WantedPostsScreen').default;
    render(<Screen navigation={mockNavigation} />);
    await waitFor(() => { expect(api.getRequests).toHaveBeenCalled(); });
  });

  it('shows empty state', async () => {
    const Screen = require('../../src/screens/WantedPostsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('No wanted posts');
  });

  it('displays request cards', async () => {
    api.getRequests.mockResolvedValue([
      { id: 'req-1', title: 'Need a Ladder', description: 'For painting', category: 'Tools', requester: { firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null }, createdAt: new Date().toISOString() },
    ]);
    const Screen = require('../../src/screens/WantedPostsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Need a Ladder');
  });

  it('tap request navigates to RequestDetail', async () => {
    api.getRequests.mockResolvedValue([
      { id: 'req-1', title: 'Need a Ladder', description: 'For painting', category: 'Tools', requester: { firstName: 'Bob', lastName: 'Smith', profilePhotoUrl: null }, createdAt: new Date().toISOString() },
    ]);
    const Screen = require('../../src/screens/WantedPostsScreen').default;
    const { findByText } = render(<Screen navigation={mockNavigation} />);
    const card = await findByText('Need a Ladder');
    fireEvent.press(card);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RequestDetail', expect.objectContaining({ id: 'req-1' }));
  });
});
