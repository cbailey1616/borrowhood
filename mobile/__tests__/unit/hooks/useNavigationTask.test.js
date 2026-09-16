import { renderHook, act } from '@testing-library/react-native';
import useNavigationTask from '../../../src/hooks/useNavigationTask';

function navigation() {
  let blur;
  const nav = { isFocused: jest.fn(() => true), addListener: jest.fn((_name, callback) => { blur = callback; return jest.fn(); }) };
  return { nav, leave: () => { nav.isFocused.mockReturnValue(false); blur(); } };
}

it('allows a result only during the original visit, even after leaving and returning', () => {
  const { nav, leave } = navigation();
  const hook = renderHook(() => useNavigationTask(nav, 'a'));
  const isCurrent = hook.result.current();
  expect(isCurrent()).toBe(true);
  act(leave);
  expect(isCurrent()).toBe(false);
  nav.isFocused.mockReturnValue(true);
  expect(isCurrent()).toBe(false);
  expect(hook.result.current()()).toBe(true);
});

it('invalidates work when a screen is reused for a different item', () => {
  const { nav } = navigation();
  const hook = renderHook(({ id }) => useNavigationTask(nav, id), { initialProps: { id: 'a' } });
  const isCurrent = hook.result.current();
  hook.rerender({ id: 'b' });
  expect(isCurrent()).toBe(false);
  expect(hook.result.current()()).toBe(true);
});

it('invalidates work on unmount and unsubscribes the blur listener', () => {
  const { nav } = navigation();
  const hook = renderHook(() => useNavigationTask(nav));
  const isCurrent = hook.result.current();
  const unsubscribe = nav.addListener.mock.results[0].value;
  hook.unmount();
  expect(isCurrent()).toBe(false);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
