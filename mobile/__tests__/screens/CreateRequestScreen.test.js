import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: true, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
const mockShowError = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false, isAuthenticated: true }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

beforeEach(() => { jest.clearAllMocks(); api.getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Tools', slug: 'tools-hardware' }]); api.createRequest.mockResolvedValue({ id: 'req-1' }); });

describe('CreateRequestScreen', () => {
  it('renders title input', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByPlaceholderText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await findByPlaceholderText(/Power drill/);
  });

  it('renders description input', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByPlaceholderText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await findByPlaceholderText(/Add more details/);
  });

  it('post request validates required fields', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { getByPlaceholderText, getByText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await waitFor(() => { expect(getByPlaceholderText(/Power drill/)).toBeTruthy(); });
    fireEvent.changeText(getByPlaceholderText(/Power drill/), 'Camping Stove');
    fireEvent.changeText(getByPlaceholderText(/Add more details/), 'Need for weekend');
    await act(async () => { fireEvent.press(getByText('Post Request')); });
    expect(mockShowError).toHaveBeenCalledWith(expect.objectContaining({ type: 'validation' }));
  });

  it('renders Post Request button', async () => {
    const CreateRequestScreen = require('../../src/screens/CreateRequestScreen').default;
    const { findByText } = render(<CreateRequestScreen navigation={mockNavigation} />);
    await findByText('Post Request');
  });
});
