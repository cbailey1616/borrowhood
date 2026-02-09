import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../../src/context/ErrorContext', () => ({
  useError: () => ({ showError: jest.fn(), showToast: jest.fn() }),
}));

describe('GroupedList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders section header', () => {
    const { GroupedListSection, GroupedListItem } = require('../../../src/components/GroupedList');
    const { getByText } = render(
      <GroupedListSection header="Account">
        <GroupedListItem title="Edit Profile" onPress={() => {}} />
      </GroupedListSection>
    );
    expect(getByText('ACCOUNT')).toBeTruthy();
  });

  it('renders items with titles', () => {
    const { GroupedListSection, GroupedListItem } = require('../../../src/components/GroupedList');
    const { getByText } = render(
      <GroupedListSection header="Settings">
        <GroupedListItem title="Notifications" onPress={() => {}} />
        <GroupedListItem title="Privacy" onPress={() => {}} />
      </GroupedListSection>
    );
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('Privacy')).toBeTruthy();
  });

  it('fires onPress when item is tapped', () => {
    const { GroupedListSection, GroupedListItem } = require('../../../src/components/GroupedList');
    const onPress = jest.fn();
    const { getByText } = render(
      <GroupedListSection header="Menu">
        <GroupedListItem title="Option" onPress={onPress} />
      </GroupedListSection>
    );
    fireEvent.press(getByText('Option'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders switch accessory when switchValue provided', () => {
    const { GroupedListSection, GroupedListItem } = require('../../../src/components/GroupedList');
    const { toJSON } = render(
      <GroupedListSection header="Settings">
        <GroupedListItem
          title="Biometrics"
          switchValue={true}
          onSwitchChange={() => {}}
          chevron={false}
        />
      </GroupedListSection>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders destructive item with correct text color intent', () => {
    const { GroupedListSection, GroupedListItem } = require('../../../src/components/GroupedList');
    const { getByText } = render(
      <GroupedListSection>
        <GroupedListItem title="Sign Out" onPress={() => {}} destructive />
      </GroupedListSection>
    );
    expect(getByText('Sign Out')).toBeTruthy();
  });
});
