import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

beforeEach(() => { jest.clearAllMocks(); });

describe('DisputesScreen', () => {
  it('renders loading state', () => {
    api.getDisputes.mockResolvedValue([]);
    const DisputesScreen = require('../../src/screens/DisputesScreen').default;
    const { getByTestId } = render(<DisputesScreen navigation={mockNavigation} />);
    expect(getByTestId('ActivityIndicator')).toBeTruthy();
  });

  it('renders empty state', async () => {
    api.getDisputes.mockResolvedValue([]);
    const DisputesScreen = require('../../src/screens/DisputesScreen').default;
    const { findByText } = render(<DisputesScreen navigation={mockNavigation} />);
    await findByText(/No disputes/i);
  });

  it('renders dispute cards with type badges', async () => {
    api.getDisputes.mockResolvedValue([{
      id: 'd1',
      transactionId: 'txn-1',
      status: 'awaitingResponse',
      type: 'damagesClaim',
      description: 'Item damaged',
      listing: { id: 'l1', title: 'Drill' },
      claimant: { id: 'u1', firstName: 'John', lastName: 'D' },
      respondent: { id: 'u2', firstName: 'Jane', lastName: 'S' },
      createdAt: new Date().toISOString(),
    }]);
    const DisputesScreen = require('../../src/screens/DisputesScreen').default;
    const { findByText } = render(<DisputesScreen navigation={mockNavigation} />);
    await findByText('Drill');
    await findByText(/Awaiting Response/i);
  });

  it('navigates to detail on card press', async () => {
    api.getDisputes.mockResolvedValue([{
      id: 'd1',
      transactionId: 'txn-1',
      status: 'awaitingResponse',
      type: 'damagesClaim',
      description: 'Item damaged',
      listing: { id: 'l1', title: 'Drill' },
      claimant: { id: 'u1', firstName: 'John', lastName: 'D' },
      respondent: { id: 'u2', firstName: 'Jane', lastName: 'S' },
      createdAt: new Date().toISOString(),
    }]);
    const DisputesScreen = require('../../src/screens/DisputesScreen').default;
    const { findByText } = render(<DisputesScreen navigation={mockNavigation} />);
    const card = await findByText('Drill');
    fireEvent.press(card);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DisputeDetail', expect.anything());
  });
});
