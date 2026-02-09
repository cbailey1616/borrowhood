import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

const { haptics } = require('../../../src/utils/haptics');

describe('SegmentedControl', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all segments', () => {
    const SegmentedControl = require('../../../src/components/SegmentedControl').default;
    const { getByText } = render(
      <SegmentedControl
        segments={['Items', 'Requests']}
        selectedIndex={0}
        onIndexChange={() => {}}
      />
    );
    expect(getByText('Items')).toBeTruthy();
    expect(getByText('Requests')).toBeTruthy();
  });

  it('fires onIndexChange when tapping inactive segment', () => {
    const SegmentedControl = require('../../../src/components/SegmentedControl').default;
    const onIndexChange = jest.fn();
    const { getByText } = render(
      <SegmentedControl
        segments={['Items', 'Requests']}
        selectedIndex={0}
        onIndexChange={onIndexChange}
      />
    );
    fireEvent.press(getByText('Requests'));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('does not fire onIndexChange for already selected segment', () => {
    const SegmentedControl = require('../../../src/components/SegmentedControl').default;
    const onIndexChange = jest.fn();
    const { getByText } = render(
      <SegmentedControl
        segments={['Items', 'Requests']}
        selectedIndex={0}
        onIndexChange={onIndexChange}
      />
    );
    fireEvent.press(getByText('Items'));
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('triggers haptic selection feedback on change', () => {
    const SegmentedControl = require('../../../src/components/SegmentedControl').default;
    const { getByText } = render(
      <SegmentedControl
        segments={['One', 'Two']}
        selectedIndex={0}
        onIndexChange={() => {}}
      />
    );
    fireEvent.press(getByText('Two'));
    expect(haptics.selection).toHaveBeenCalled();
  });
});
