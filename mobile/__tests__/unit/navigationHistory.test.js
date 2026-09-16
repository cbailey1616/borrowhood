import { CommonActions, StackRouter } from '@react-navigation/routers';
import { detailRouteIds } from '../../src/navigation/routeIdentity';

it.each([
  ['ListingDetail', { id: 'a' }, { id: 'b' }],
  ['RequestDetail', { id: 'a' }, { id: 'b' }],
  ['UserProfile', { id: 'a' }, { id: 'b' }],
  ['TransactionDetail', { id: 'a' }, { id: 'b' }],
  ['RequestQueue', { listingId: 'a' }, { listingId: 'b' }],
  ['Chat', { conversationId: 'a' }, { conversationId: 'b' }],
  ['Chat', { recipientId: 'a' }, { recipientId: 'b' }],
])('%s keeps separate history for different entities and reuses the same entity', (name, first, second) => {
  const router = StackRouter({ initialRouteName: 'Main' });
  const options = { routeNames: ['Main', ...Object.keys(detailRouteIds)], routeParamList: {}, routeGetIdList: detailRouteIds };
  let state = router.getInitialState(options);
  const dispatch = action => { state = router.getStateForAction(state, action, options); };
  dispatch(CommonActions.navigate(name, first));
  const firstRoute = state.routes[state.index];
  dispatch(CommonActions.navigate(name, second));
  expect(state.routes).toHaveLength(3);
  expect(state.routes[1]).toEqual(firstRoute);
  expect(state.routes[2].key).not.toBe(firstRoute.key);
  dispatch(CommonActions.goBack());
  expect(state.routes[state.index]).toEqual(firstRoute);
  dispatch(CommonActions.navigate(name, first));
  expect(state.routes).toHaveLength(2);
  expect(state.routes[state.index].key).toBe(firstRoute.key);
});
