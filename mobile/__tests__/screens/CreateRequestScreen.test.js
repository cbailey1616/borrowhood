import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); mockUser.isVerified = true; api.getFriends.mockResolvedValue([{ id: 'friend-1' }]); api.getCommunities.mockResolvedValue([]); api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]); api.createRequest.mockResolvedValue({ id: 'req-1' }); });

describe('CreateRequestScreen', () => {
  it('renders title input', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByPlaceholderText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await findByPlaceholderText(/Power drill/);
  });

  it('renders description input', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByPlaceholderText, findByText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    fireEvent.press(await findByText('Add optional details'));
    await findByPlaceholderText(/Add more details/);
  });

  it('post request validates required fields', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { getByPlaceholderText, getByText, getByTestId } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await waitFor(() => { expect(getByPlaceholderText(/Power drill/)).toBeTruthy(); });
    // Title is the required field (Category is optional). Submit with an empty
    // title and validation should fire.
    await waitFor(() => expect(getByTestId('CreateRequest.button.submit')).not.toBeDisabled());
    await act(async () => { fireEvent.press(getByText('Post Request')); });
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ type: 'validation' }));
  });

  it('renders Post Request button', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await findByText('Post Request');
  });

  it('blocks a request nobody can see and offers an explicit next step', async () => {
    mockUser.isVerified = false;
    api.getFriends.mockResolvedValue([]);
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const { findByText, getByTestId, getByPlaceholderText } = render(<Screen navigation={mockNavigation} />);
    await findByText(/Nobody else would see/);
    fireEvent.changeText(getByPlaceholderText(/Power drill/), 'A drill');
    expect(getByTestId('CreateRequest.button.submit')).toBeDisabled();
    expect(api.createRequest).not.toHaveBeenCalled();
    expect(await findByText('Invite someone')).toBeTruthy();
  });

  it('shows date presets without requiring typed date strings or optional details', async () => {
    const Screen = require('../../src/screens/CreateRequestScreen').default;
    const { findByText, getByLabelText, queryByPlaceholderText } = render(<Screen navigation={mockNavigation} />);
    await findByText('Today');
    expect(getByLabelText('Choose needed from date')).toBeTruthy();
    expect(queryByPlaceholderText('YYYY-MM-DD')).toBeNull();
    expect(queryByPlaceholderText(/Add more details/)).toBeNull();
  });
});
