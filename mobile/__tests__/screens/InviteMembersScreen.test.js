import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: () => ({ setOptions: jest.fn() }), dispatch: jest.fn(), canGoBack: () => true };
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../src/context/ErrorContext', () => ({ useError: () => ({ showError: jest.fn(), showToast: jest.fn() }) }));
beforeEach(() => { jest.clearAllMocks(); });
describe('InviteMembersScreen', () => {
  const route = { params: { communityId: 'comm-1' } };
  it('renders invite code', () => {
    const Screen = require('../../src/screens/InviteMembersScreen').default;
    const { getAllByText } = render(<Screen navigation={mockNavigation} route={route} />);
    // The invite code is "BH-COMM-1" (communityId.slice(0,8).toUpperCase() = "COMM-1")
    const matches = getAllByText(/BH-/);
    expect(matches.length).toBeGreaterThan(0);
  });
  it('renders share button', () => {
    const Screen = require('../../src/screens/InviteMembersScreen').default;
    const { getByText } = render(<Screen navigation={mockNavigation} route={route} />);
    // The button text is "Share Invite Link"
    expect(getByText('Share Invite Link')).toBeTruthy();
  });
  it('renders email input', () => {
    const Screen = require('../../src/screens/InviteMembersScreen').default;
    const { getByPlaceholderText } = render(<Screen navigation={mockNavigation} route={route} />);
    expect(getByPlaceholderText(/neighbor@email/i)).toBeTruthy();
  });
  it('email input accepts text', () => {
    const Screen = require('../../src/screens/InviteMembersScreen').default;
    const { getByPlaceholderText } = render(<Screen navigation={mockNavigation} route={route} />);
    fireEvent.changeText(getByPlaceholderText(/neighbor@email/i), 'friend@test.com');
  });
});
