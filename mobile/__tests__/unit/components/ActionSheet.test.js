import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('ActionSheet', () => {
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
