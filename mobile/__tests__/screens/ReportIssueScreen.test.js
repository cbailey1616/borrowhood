import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockShowError = jest.fn();
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: mockShowError, showToast: jest.fn() }) }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };

beforeEach(() => {
  jest.clearAllMocks();
  api.fileDispute.mockResolvedValue({ id: 'dispute-1', status: 'awaitingResponse' });
  api.uploadImages.mockResolvedValue([]);
});

describe('ReportIssueScreen', () => {
  const route = { params: { transactionId: 'txn-1', depositAmount: 50, listingTitle: 'Circular Saw', borrowerId: 'user-2', lenderId: 'user-1' } };

  it('renders type picker options', () => {
    const ReportIssueScreen = require('../../src/screens/ReportIssueScreen').default;
    const { getByText } = render(<ReportIssueScreen navigation={mockNavigation} route={route} />);
    expect(getByText('Damages Claim')).toBeTruthy();
  });

  it('renders description input', () => {
    const ReportIssueScreen = require('../../src/screens/ReportIssueScreen').default;
    const { getByTestId } = render(<ReportIssueScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('ReportIssue.input.description')).toBeTruthy();
  });

  it('renders add photo button', () => {
    const ReportIssueScreen = require('../../src/screens/ReportIssueScreen').default;
    const { getByTestId } = render(<ReportIssueScreen navigation={mockNavigation} route={route} />);
    expect(getByTestId('ReportIssue.button.addPhoto')).toBeTruthy();
  });

  it('submit calls api.fileDispute', async () => {
    const ReportIssueScreen = require('../../src/screens/ReportIssueScreen').default;
    const { getByTestId, getByText } = render(<ReportIssueScreen navigation={mockNavigation} route={route} />);
    fireEvent.press(getByText('Damages Claim'));
    fireEvent.changeText(getByTestId('ReportIssue.input.description'), 'Item came back badly damaged with scratches');
    fireEvent.changeText(getByTestId('ReportIssue.input.amount'), '25');
    await act(async () => { fireEvent.press(getByTestId('ReportIssue.button.submit')); });
    expect(api.fileDispute).toHaveBeenCalled();
  });

  it('amount field shown only for damagesClaim type', () => {
    const ReportIssueScreen = require('../../src/screens/ReportIssueScreen').default;
    const { getByText, getByTestId } = render(<ReportIssueScreen navigation={mockNavigation} route={route} />);
    fireEvent.press(getByText('Damages Claim'));
    expect(getByTestId('ReportIssue.input.amount')).toBeTruthy();
  });

  it('displays listing title', () => {
    const ReportIssueScreen = require('../../src/screens/ReportIssueScreen').default;
    const { getByText } = render(<ReportIssueScreen navigation={mockNavigation} route={route} />);
    expect(getByText('Circular Saw')).toBeTruthy();
  });
});
