import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockUser = { id: 'user-1', firstName: 'Test', lastName: 'User', referralCode: 'BH-TEST', profilePhotoUrl: null };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getReferralCode.mockResolvedValue({ referralCode: 'BH-TEST' }); api.getReferralStatus.mockResolvedValue({ referralCount: 0, eligible: false, rewardClaimed: false }); });
describe('ReferralScreen', () => {
  it('displays referral code', async () => { const S = require('../../src/screens/ReferralScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('BH-TEST'); });
  it('shows share button', async () => { const S = require('../../src/screens/ReferralScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/Share with Friends/i); });
  it('shows referral code label', async () => { const S = require('../../src/screens/ReferralScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('Your Referral Code'); });
  it('shows referral progress', async () => { const S = require('../../src/screens/ReferralScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/0 of 3 friends joined/); });
});
