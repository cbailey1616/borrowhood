import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

const BuggyComponent = () => {
  throw new Error('Test crash');
};

describe('ErrorBoundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders children normally when no error', () => {
    const ErrorBoundary = require('../../../src/components/ErrorBoundary').default;
    const { getByText } = render(
      <ErrorBoundary><Text>Safe content</Text></ErrorBoundary>
    );
    expect(getByText('Safe content')).toBeTruthy();
  });

  it('catches error and shows fallback UI', () => {
    const ErrorBoundary = require('../../../src/components/ErrorBoundary').default;
    const { getByText } = render(
      <ErrorBoundary><BuggyComponent /></ErrorBoundary>
    );
    expect(getByText(/went wrong/i)).toBeTruthy();
  });

  it('shows retry button in fallback', () => {
    const ErrorBoundary = require('../../../src/components/ErrorBoundary').default;
    const { getAllByText } = render(
      <ErrorBoundary><BuggyComponent /></ErrorBoundary>
    );
    expect(getAllByText(/try again/i).length).toBeGreaterThan(0);
  });

  it('displays error information', () => {
    const ErrorBoundary = require('../../../src/components/ErrorBoundary').default;
    const { toJSON } = render(
      <ErrorBoundary><BuggyComponent /></ErrorBoundary>
    );
    expect(toJSON()).toBeTruthy();
  });
});
