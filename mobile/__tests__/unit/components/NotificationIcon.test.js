import React from 'react';
import { render } from '@testing-library/react-native';
import Icon from '../../../src/components/Icon';
import NotificationIcon from '../../../src/components/NotificationIcon';

it.each(['friend_request', 'join_request', 'circle_invite'])('uses the invitation illustration for %s', type => {
  const screen = render(<NotificationIcon notification={{ type }} />);
  expect(screen.UNSAFE_getByType(Icon.type).props).toMatchObject({ name: 'neighbor-invite', illustrated: true });
});

it('uses the neighborhood illustration for steward assignments', () => {
  const screen = render(<NotificationIcon notification={{ type: 'steward_assigned' }} />);
  expect(screen.UNSAFE_getByType(Icon.type).props.name).toBe('neighbors-manage');
});
