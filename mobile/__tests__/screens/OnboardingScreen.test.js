import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import api from '../../src/services/api';

const mockUser = { id: 'user-1', firstName: 'Test', city: '', state: '' };
const mockRefreshUser = jest.fn();

jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }) }));

beforeEach(() => {
  jest.clearAllMocks();
  api.updateProfile.mockResolvedValue({});
  api.getCommunities.mockResolvedValue([]);
});

describe('OnboardingScreen', () => {
  const mockOnComplete = jest.fn();

  it('renders step 1 (location) initially', () => {
    const Screen = require('../../src/screens/OnboardingScreen').default;
    const { getByText } = render(<Screen onComplete={mockOnComplete} />);
    expect(getByText('Where are you located?')).toBeTruthy();
  });

  it('has Use My Location button', () => {
    const Screen = require('../../src/screens/OnboardingScreen').default;
    const { getByText } = render(<Screen onComplete={mockOnComplete} />);
    expect(getByText('Use My Location')).toBeTruthy();
  });

  it('has city and state inputs', () => {
    const Screen = require('../../src/screens/OnboardingScreen').default;
    const { getByPlaceholderText } = render(<Screen onComplete={mockOnComplete} />);
    expect(getByPlaceholderText('City')).toBeTruthy();
    expect(getByPlaceholderText('State')).toBeTruthy();
  });

  it('shows continue button', () => {
    const Screen = require('../../src/screens/OnboardingScreen').default;
    const { getByText } = render(<Screen onComplete={mockOnComplete} />);
    expect(getByText('Continue')).toBeTruthy();
  });

  it('renders progress dots', () => {
    const Screen = require('../../src/screens/OnboardingScreen').default;
    const { UNSAFE_root } = render(<Screen onComplete={mockOnComplete} />);
    // 3 progress dots rendered
    const progressDots = UNSAFE_root.findAll(n => n.props.style && Array.isArray(n.props.style) && n.props.style.length >= 2);
    expect(progressDots.length).toBeGreaterThan(0);
  });

  it('advances to step 2 after saving location', async () => {
    mockRefreshUser.mockResolvedValue({});
    const Screen = require('../../src/screens/OnboardingScreen').default;
    const { getByPlaceholderText, getByText, findByText } = render(<Screen onComplete={mockOnComplete} />);
    fireEvent.changeText(getByPlaceholderText('City'), 'Boston');
    fireEvent.changeText(getByPlaceholderText('State'), 'MA');
    await act(async () => { fireEvent.press(getByText('Continue')); });
    await findByText('Join a Neighborhood');
  });
});
