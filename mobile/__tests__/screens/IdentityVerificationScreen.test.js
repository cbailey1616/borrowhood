import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', subscriptionTier: 'plus', isVerified: false, profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true, popToTop: jest.fn(), replace: jest.fn() };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: jest.fn() }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.createVerificationSession.mockResolvedValue({ sessionId: 'vs_test', ephemeralKeySecret: 'ek_test' }); api.getVerificationStatus.mockResolvedValue({ status: 'none' }); });
describe('IdentityVerificationScreen', () => {
  const route = { params: { source: 'generic' } };
  it('renders verify button', async () => { const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.button.verify'); });
  it('renders skip button', async () => { const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.button.skipForNow'); });
  it('shows verified state when already verified', async () => { api.getVerificationStatus.mockResolvedValue({ status: 'verified', verified: true }); const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.status.verified'); });
  it('shows processing state', async () => { api.getVerificationStatus.mockResolvedValue({ status: 'processing' }); const S = require('../../src/screens/IdentityVerificationScreen').default; const { findByTestId } = render(<S navigation={mockNavigation} route={route} />); await findByTestId('Identity.status.processing'); });
});
