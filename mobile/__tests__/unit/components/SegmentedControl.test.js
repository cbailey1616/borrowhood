import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { COLORS } from '../../../src/utils/config';

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

  it('uses medium-weight ribbon labels with darker ink for the selected tab', () => {
    const SegmentedControl = require('../../../src/components/SegmentedControl').default;
    const screen = render(<SegmentedControl variant="underline" segments={['Items', 'Wanted', 'My requests']}
      selectedIndex={2} onIndexChange={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByText('Items').props.style).color).toBe(COLORS.primary);
    expect(StyleSheet.flatten(screen.getByText('Items').props.style).fontFamily).toBe('DMSans_500Medium');
    expect(StyleSheet.flatten(screen.getByText('My requests').props.style).fontFamily).toBe('DMSans_500Medium');
    expect(StyleSheet.flatten(screen.getByText('My requests').props.style).color).toBe(COLORS.primaryDark);
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
