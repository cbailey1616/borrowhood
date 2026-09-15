import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import { requestQueueHeaderOptions } from '../../../src/components/RequestQueueHeader';

// Exercise real stack transitions, rather than only asserting a mocked goBack call.
function createNavigation(routes) {
  const router = StackRouter({ initialRouteName: 'Main' });
  const options = {
    routeNames: ['Main', 'ListingDetail', 'Chat', 'TransactionDetail', 'RequestQueue'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let state = router.getRehydratedState({ stale: true, routes, index: routes.length - 1 }, options);
  const dispatch = action => { state = router.getStateForAction(state, action, options) || state; };
  return {
    getState: () => state,
    canGoBack: () => router.getStateForAction(state, CommonActions.goBack(), options) !== null,
    goBack: () => dispatch(CommonActions.goBack()),
    replace: (name, params) => dispatch(StackActions.replace(name, params)),
  };
}

const main = tab => ({ name: 'Main', params: { screen: tab } });
const queue = { name: 'RequestQueue', params: { listingId: 'ladder' } };

it.each([
  ['My Posts', [main('MyItems')]],
  ['Inbox', [main('Activity')]],
  ['item details', [main('Feed'), { name: 'ListingDetail', params: { id: 'ladder' } }]],
  ['a conversation', [main('Activity'), { name: 'Chat', params: { conversationId: 'chat-1' } }]],
  ['exchange details', [main('Activity'), { name: 'TransactionDetail', params: { id: 'exchange-1' } }]],
])('returns to %s with its original route and history intact', (_label, previousRoutes) => {
  const navigation = createNavigation([...previousRoutes, queue]);
  const previous = navigation.getState().routes.slice(0, -1);
  const screen = render(requestQueueHeaderOptions.header({ navigation }));
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(navigation.getState().routes).toEqual(previous);
  expect(navigation.getState().index).toBe(previous.length - 1);
});

it('replaces a standalone queue with My Posts so it cannot trap the user', () => {
  const navigation = createNavigation([queue]);
  const screen = render(requestQueueHeaderOptions.header({ navigation }));
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(navigation.getState().routes).toEqual([
    expect.objectContaining({ name: 'Main', params: { screen: 'MyItems' } }),
  ]);
});
