import React from 'react';
import { render } from '@testing-library/react-native';
import Icon from '../../../src/components/Icon';
import NotificationIcon from '../../../src/components/NotificationIcon';

it.each(['friend_request', 'join_request', 'circle_invite'])('restores the illustrated invitation for %s', type => {
  const screen = render(<NotificationIcon notification={{ type }} />);
  expect(screen.UNSAFE_getByType(Icon.type).props).toMatchObject({ name: 'neighbor-invite', illustrated: true, size: 22 });
});

it('uses the original neighborhood drawing for steward assignments', () => {
  const screen = render(<NotificationIcon notification={{ type: 'steward_assigned' }} />);
  expect(screen.UNSAFE_getByType(Icon.type).props.name).toBe('neighbors-manage');
});

it.each(['request_declined', 'giveaway_expired'])('keeps clear warning ink for %s', type => {
  const screen = render(<NotificationIcon notification={{ type }} />);
  expect(screen.UNSAFE_getByType(Icon.type).props.illustrated).toBe(false);
});
