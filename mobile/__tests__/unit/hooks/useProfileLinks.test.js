import { Linking } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import useProfileLinks from '../../../src/hooks/useProfileLinks';
import { createProfileLink } from '../../../src/utils/profileLinks';

const id = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const signedIn = { isLoading: false, isAuthenticated: true, user: { id: otherId, onboardingCompleted: true } };
let receiveUrl, removeLink;
beforeEach(() => {
  removeLink = jest.fn();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation((_event, callback) => {
    receiveUrl = callback;
    return { remove: removeLink };
  });
});
afterEach(() => { jest.restoreAllMocks(); });

function navigator(ready = true, routes = ['Main', 'UserProfile']) {
  const listeners = {};
  const ref = {
    isReady: jest.fn(() => ready),
    getRootState: jest.fn(() => ({ routeNames: routes })),
    navigate: jest.fn(() => listeners.state?.()),
    addListener: jest.fn((name, callback) => {
      listeners[name] = callback;
      return () => { if (listeners[name] === callback) delete listeners[name]; };
    }),
  };
  return { ref, emit: event => listeners[event]?.() };
}

it('opens a cold-start profile once after navigation becomes ready', async () => {
  Linking.getInitialURL.mockResolvedValue(createProfileLink(id));
  const { ref, emit } = navigator(false);
  const hook = renderHook(() => useProfileLinks(ref, signedIn));
  await waitFor(() => expect(ref.addListener).toHaveBeenCalledWith('ready', expect.any(Function)));
  expect(ref.navigate).not.toHaveBeenCalled();
  ref.isReady.mockReturnValue(true);
  act(() => emit('ready'));
  expect(ref.navigate).toHaveBeenCalledWith('UserProfile', { id });
  act(() => emit('state'));
  expect(ref.navigate).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(removeLink).toHaveBeenCalled();
});

it('keeps the scanned profile through sign-in, onboarding and name setup', async () => {
  Linking.getInitialURL.mockResolvedValue(createProfileLink(id));
  const { ref, emit } = navigator(true, ['Auth']);
  const hook = renderHook(auth => useProfileLinks(ref, auth), {
    initialProps: { isLoading: true, isAuthenticated: false, user: null },
  });
  await act(async () => {});
  hook.rerender({ isLoading: false, isAuthenticated: false, user: null });
  expect(ref.navigate).not.toHaveBeenCalled();
  hook.rerender({ ...signedIn, user: { ...signedIn.user, onboardingCompleted: false } });
  expect(ref.navigate).not.toHaveBeenCalled();
  hook.rerender({ ...signedIn, user: { ...signedIn.user, needsName: true } });
  expect(ref.navigate).not.toHaveBeenCalled();
  hook.rerender(signedIn);
  expect(ref.navigate).not.toHaveBeenCalled();
  ref.getRootState.mockReturnValue({ routeNames: ['Main', 'UserProfile'] });
  act(() => emit('state'));
  expect(ref.navigate).toHaveBeenCalledTimes(1);
  expect(ref.navigate).toHaveBeenCalledWith('UserProfile', { id });
});

it('opens links received while running and ignores unrelated URLs', async () => {
  const { ref } = navigator();
  renderHook(() => useProfileLinks(ref, signedIn));
  await act(async () => receiveUrl({ url: 'com.borrowhood.app://stripe-redirect' }));
  expect(ref.navigate).not.toHaveBeenCalled();
  act(() => receiveUrl({ url: `borrowhood://people/${id}` }));
  expect(ref.navigate).toHaveBeenCalledWith('UserProfile', { id });
  act(() => receiveUrl({ url: createProfileLink(otherId) }));
  expect(ref.navigate).toHaveBeenLastCalledWith('UserProfile', { id: otherId });
});

it('does not replace a newer scan with a late initial URL', async () => {
  let resolveInitial;
  Linking.getInitialURL.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }));
  const { ref } = navigator();
  renderHook(() => useProfileLinks(ref, signedIn));
  act(() => receiveUrl({ url: createProfileLink(otherId) }));
  await act(async () => resolveInitial(createProfileLink(id)));
  expect(ref.navigate).toHaveBeenCalledTimes(1);
  expect(ref.navigate).toHaveBeenCalledWith('UserProfile', { id: otherId });
});
