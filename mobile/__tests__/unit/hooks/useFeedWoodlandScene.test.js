import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import useFeedWoodlandScene from '../../../src/hooks/useFeedWoodlandScene';
import { FEED_WOODLAND_SCENES } from '../../../src/assets/feed-woodland-scenes';

let storage;
beforeEach(() => {
  storage = new Map();
  SecureStore.getItemAsync.mockReset().mockImplementation(async key => storage.get(key) ?? null);
  SecureStore.setItemAsync.mockReset().mockImplementation(async (key, value) => { storage.set(key, value); });
});

const mount = (userId = 'neighbor-a', signedIn = false) => renderHook(
  props => useFeedWoodlandScene(props.userId, props.signedIn),
  { initialProps: { userId, signedIn } },
);

it('cycles through six scenes once per sign-in, wraps, and remembers a fresh launch', async () => {
  const hook = mount();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  for (const expected of [0, 1, 2, 3, 4, 5, 0]) {
    await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: true }));
    expect(hook.result.current).toBe(expected);
    await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: false }));
  }
  expect(FEED_WOODLAND_SCENES).toHaveLength(6);
  hook.unmount();
  const relaunched = mount('neighbor-a', true);
  await waitFor(() => expect(relaunched.result.current).toBe(1));
});

it('keeps the same scene during rerenders and remembers each account separately', async () => {
  const hook = mount();
  await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: true }));
  await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: true }));
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  await act(async () => hook.rerender({ userId: 'neighbor-b', signedIn: true }));
  expect(hook.result.current).toBe(0);
  await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: true }));
  expect(hook.result.current).toBe(1);
  expect(storage.size).toBe(2);
});

it('keeps working without storage and safely recovers an unknown saved scene', async () => {
  SecureStore.getItemAsync.mockResolvedValueOnce('retired-scene');
  SecureStore.setItemAsync.mockRejectedValueOnce(new Error('Storage unavailable'));
  const hook = mount();
  await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: true }));
  expect(hook.result.current).toBe(0);
  await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: false }));
  await act(async () => hook.rerender({ userId: 'neighbor-a', signedIn: true }));
  expect(hook.result.current).toBe(1);
  SecureStore.getItemAsync.mockRejectedValueOnce(new Error('Storage unavailable'));
  await act(async () => hook.rerender({ userId: 'neighbor-b', signedIn: true }));
  expect(hook.result.current).toBe(0);
});

it('ignores a slow selection after the account changes or signs out', async () => {
  let finish;
  SecureStore.getItemAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const hook = mount('neighbor-a', true);
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => hook.rerender({ userId: 'neighbor-b', signedIn: true }));
  await act(async () => finish('autumn-woods'));
  expect(hook.result.current).toBe(0);
  await act(async () => hook.rerender({ userId: 'neighbor-b', signedIn: false }));
  expect(hook.result.current).toBe(0);
});
