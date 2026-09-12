import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Modal } from 'react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('ActionSheet', () => {
  it.each([false, true])('exposes the current filter selection and dismisses before applying it (%s)', selected => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const close = jest.fn();
    const select = jest.fn();
    const screen = render(<ActionSheet isVisible onClose={close} title="Inbox options" variant="options"
      actions={[{ label: 'Unread only', selected, onPress: select }, { label: 'Mark all as read', onPress: jest.fn() }]} />);
    const filter = screen.getByRole('checkbox', { name: 'Unread only', checked: selected });
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeTruthy();
    fireEvent.press(filter);
    expect(select).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('closes the compact options sheet without changing the inbox', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const close = jest.fn();
    const select = jest.fn();
    const screen = render(<ActionSheet isVisible onClose={close} title="Inbox options" variant="options"
      actions={[{ label: 'Unread only', selected: false, onPress: select }]} />);
    expect(screen.queryByText('Cancel')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Close Inbox options' }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });

  it('removes the iOS touch layer before navigating and closes once', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const close = jest.fn();
    const navigate = jest.fn(() => expect(screen.queryByText('Create listing')).toBeNull());
    const screen = render(<ActionSheet isVisible onClose={close}
      actions={[{ label: 'Create listing', onPress: navigate }]} />);
    fireEvent.press(screen.getByText('Create listing'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
  });
  beforeEach(() => jest.clearAllMocks());

  it('renders when visible', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const { getByText } = render(
      <ActionSheet
        isVisible={true}
        onClose={() => {}}
        title="Choose Action"
        actions={[{ label: 'Option 1', onPress: () => {} }]}
      />
    );
    expect(getByText('Choose Action')).toBeTruthy();
  });

  it('returns null when not visible', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const { toJSON } = render(
      <ActionSheet
        isVisible={false}
        onClose={() => {}}
        title="Hidden"
        actions={[]}
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders title and message', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const { getByText } = render(
      <ActionSheet
        isVisible={true}
        onClose={() => {}}
        title="Sign Out"
        message="Are you sure?"
        actions={[]}
      />
    );
    expect(getByText('Sign Out')).toBeTruthy();
    expect(getByText('Are you sure?')).toBeTruthy();
  });

  it('renders all action options', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const { getByText } = render(
      <ActionSheet
        isVisible={true}
        onClose={() => {}}
        actions={[
          { label: 'Take Photo', onPress: () => {} },
          { label: 'Choose from Library', onPress: () => {} },
        ]}
      />
    );
    expect(getByText('Take Photo')).toBeTruthy();
    expect(getByText('Choose from Library')).toBeTruthy();
  });

  it('renders destructive option', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const { getByText } = render(
      <ActionSheet
        isVisible={true}
        onClose={() => {}}
        actions={[
          { label: 'Delete', onPress: () => {}, destructive: true },
        ]}
      />
    );
    expect(getByText('Delete')).toBeTruthy();
  });

  it('renders cancel button', () => {
    const ActionSheet = require('../../../src/components/ActionSheet').default;
    const { getByText } = render(
      <ActionSheet
        isVisible={true}
        onClose={() => {}}
        cancelLabel="Cancel"
        actions={[]}
      />
    );
    expect(getByText('Cancel')).toBeTruthy();
  });
});
