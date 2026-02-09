import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@test.com', phone: '555-1234', bio: 'Hello!', city: 'Boston', state: 'MA', latitude: 42.36, longitude: -71.06, isVerified: false, profilePhotoUrl: null, subscriptionTier: 'plus' };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: jest.fn() }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.updateProfile.mockResolvedValue({}); api.uploadImage.mockResolvedValue('https://test.s3.amazonaws.com/test.jpg'); });
describe('EditProfileScreen', () => {
  it('pre-populates first name', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); expect(getByDisplayValue('Test')).toBeTruthy(); });
  it('pre-populates last name', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); expect(getByDisplayValue('User')).toBeTruthy(); });
  it('pre-populates bio', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); expect(getByDisplayValue('Hello!')).toBeTruthy(); });
  it('save calls api.updateProfile', async () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByText } = render(<S navigation={mockNavigation} />); await act(async () => { fireEvent.press(getByText(/Save/i)); }); expect(api.updateProfile).toHaveBeenCalled(); });
  it('first name is editable', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByDisplayValue } = render(<S navigation={mockNavigation} />); fireEvent.changeText(getByDisplayValue('Test'), 'Updated'); });
  it('shows email info', () => { const S = require('../../src/screens/EditProfileScreen').default; const { getByText } = render(<S navigation={mockNavigation} />); expect(getByText(/test@test.com/)).toBeTruthy(); });
});
