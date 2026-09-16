import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import { requestQueueHeaderOptions } from '../../../src/components/RequestQueueHeader';
import { itemDetailsHeaderOptions } from '../../../src/components/ItemDetailsHeader';
import BackHeader, { renderBackHeader } from '../../../src/components/BackHeader';

// Exercise real stack transitions, rather than only asserting a mocked goBack call.
function createNavigation(routes) {
  const router = StackRouter({ initialRouteName: 'Main' });
  const options = {
    routeNames: ['Main', 'ListingDetail', 'Chat', 'TransactionDetail', 'RequestQueue', 'RequestDetail', 'UserProfile', 'ListingDiscussion', 'OnboardingVerification', 'OnboardingPlan'],
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
describe.each([
  ['request queue', requestQueueHeaderOptions, { name: 'RequestQueue', params: { listingId: 'ladder' } }, 'MyItems'],
  ['item details', itemDetailsHeaderOptions, { name: 'ListingDetail', params: { id: 'ladder' } }, 'Feed'],
  ...['Chat', 'TransactionDetail', 'RequestDetail', 'UserProfile', 'ListingDiscussion'].map(name => [
    name,
    { header: props => renderBackHeader({ ...props, options: { title: name }, route: { name } }) },
    { name, params: { id: 'detail-1' } },
    'Feed',
  ]),
])('%s back button', (_label, headerOptions, detailRoute, fallbackTab) => {

  it.each([
    ['My Posts', [main('MyItems')]],
    ['Inbox', [main('Activity')]],
    ['item details', [main('Feed'), { name: 'ListingDetail', params: { id: 'ladder' } }]],
    ['a conversation', [main('Activity'), { name: 'Chat', params: { conversationId: 'chat-1' } }]],
    ['exchange details', [main('Activity'), { name: 'TransactionDetail', params: { id: 'exchange-1' } }]],
  ])('returns to %s with its original route and history intact', (_label, previousRoutes) => {
    const navigation = createNavigation([...previousRoutes, detailRoute]);
    const previous = navigation.getState().routes.slice(0, -1);
    const screen = render(headerOptions.header({ navigation }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(navigation.getState().routes).toEqual(previous);
    expect(navigation.getState().index).toBe(previous.length - 1);
  });

  it('replaces a standalone detail route with its fallback tab', () => {
    const navigation = createNavigation([detailRoute]);
    const screen = render(headerOptions.header({ navigation }));
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(navigation.getState().routes).toEqual([
      expect.objectContaining({ name: 'Main', params: { screen: fallbackTab } }),
    ]);
  });

});

it('uses updated screen titles in the shared header', () => {
  const navigation = createNavigation([main('Activity'), { name: 'Chat' }]);
  const screen = render(renderBackHeader({ navigation, options: { title: 'Lauren Bailey' }, route: { name: 'Chat' } }));
  expect(screen.getByRole('header').props.children).toBe('Lauren Bailey');
  screen.rerender(renderBackHeader({ navigation, options: { title: 'Thread' }, route: { name: 'ListingDiscussion' } }));
  expect(screen.getByRole('header').props.children).toBe('Thread');
});

it('keeps a standalone onboarding screen inside onboarding', () => {
  const navigation = createNavigation([{ name: 'OnboardingVerification' }]);
  const screen = render(<BackHeader navigation={navigation} title="Verification" fallbackRoute="OnboardingPlan" />);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(navigation.getState().routes).toEqual([expect.objectContaining({ name: 'OnboardingPlan' })]);
});
