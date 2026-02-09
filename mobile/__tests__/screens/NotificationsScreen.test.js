import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); api.getNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 }); });
describe('NotificationsScreen', () => {
  it('fetches notifications on mount', async () => { const S = require('../../src/screens/NotificationsScreen').default; render(<S navigation={mockNavigation} />); await waitFor(() => { expect(api.getNotifications).toHaveBeenCalled(); }); });
  it('shows empty state', async () => { const S = require('../../src/screens/NotificationsScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/no notification/i); });
  it('displays notifications', async () => { api.getNotifications.mockResolvedValue({ notifications: [{ id: 'n-1', type: 'borrow_request', title: 'New request', body: 'Alice wants your drill', isRead: false, createdAt: new Date().toISOString(), transactionId: 'txn-1' }], unreadCount: 1 }); const S = require('../../src/screens/NotificationsScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText('New request'); });
  it('shows mark all read when unread', async () => { api.getNotifications.mockResolvedValue({ notifications: [{ id: 'n-1', type: 'borrow_request', title: 'New request', body: 'Alice wants drill', isRead: false, createdAt: new Date().toISOString() }], unreadCount: 1 }); const S = require('../../src/screens/NotificationsScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); await findByText(/Mark all/i); });
  it('tap notification marks read', async () => { api.getNotifications.mockResolvedValue({ notifications: [{ id: 'n-1', type: 'borrow_request', title: 'New request', body: 'Alice wants drill', isRead: false, createdAt: new Date().toISOString(), transactionId: 'txn-1' }], unreadCount: 1 }); const S = require('../../src/screens/NotificationsScreen').default; const { findByText } = render(<S navigation={mockNavigation} />); const notif = await findByText('New request'); await act(async () => { fireEvent.press(notif); }); expect(api.markNotificationRead).toHaveBeenCalledWith('n-1'); });
});
