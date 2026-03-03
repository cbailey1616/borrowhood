import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

beforeEach(() => {
  jest.clearAllMocks();
  api.respondToDispute.mockResolvedValue({ success: true, status: 'underReview' });
  api.uploadImages.mockResolvedValue([]);
});

describe('RespondToDisputeScreen', () => {
  const route = { params: { disputeId: 'dispute-1', claimantName: 'John Smith', type: 'damagesClaim', description: 'Item was damaged on return' } };

  it('renders response description input', () => {
    const RespondToDisputeScreen = require('../../src/screens/RespondToDisputeScreen').default;
    const { getByTestId } = render(<RespondToDisputeScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('RespondDispute.input.description')).toBeTruthy();
  });

  it('renders add photo button', () => {
    const RespondToDisputeScreen = require('../../src/screens/RespondToDisputeScreen').default;
    const { getByTestId } = render(<RespondToDisputeScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('RespondDispute.button.addPhoto')).toBeTruthy();
  });

  it('shows claim summary', () => {
    const RespondToDisputeScreen = require('../../src/screens/RespondToDisputeScreen').default;
    const { getByText } = render(<RespondToDisputeScreen navigation={mockNavigation} route={route} />);
    expect(getByText('Item was damaged on return')).toBeTruthy();
  });

  it('submit calls api.respondToDispute', async () => {
    const RespondToDisputeScreen = require('../../src/screens/RespondToDisputeScreen').default;
    const { getByTestId } = render(<RespondToDisputeScreen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByTestId('RespondDispute.input.description'), 'The item was returned in good condition');
    await act(async () => { fireEvent.press(getByTestId('RespondDispute.button.submit')); });
    expect(api.respondToDispute).toHaveBeenCalled();
  });
});
