import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('SkeletonLoader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders placeholder shape with default export', () => {
    const SkeletonShape = require('../../../src/components/SkeletonLoader').default;
    const { toJSON } = render(<SkeletonShape width={200} height={20} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders SkeletonListItem variant', () => {
    const { SkeletonListItem } = require('../../../src/components/SkeletonLoader');
    const { toJSON } = render(<SkeletonListItem />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders SkeletonCard variant', () => {
    const { SkeletonCard } = require('../../../src/components/SkeletonLoader');
    const { toJSON } = render(<SkeletonCard />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders SkeletonProfile variant', () => {
    const { SkeletonProfile } = require('../../../src/components/SkeletonLoader');
    const { toJSON } = render(<SkeletonProfile />);
    expect(toJSON()).toBeTruthy();
  });
});
