import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import useReduceMotion from '../../../src/hooks/useReduceMotion';

afterEach(() => jest.restoreAllMocks());

it('starts still and follows live native preference changes without stale responses', async () => {
  let resolveInitial;
  let onChange;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(resolve => { resolveInitial = resolve; }));
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => { onChange = listener; return { remove }; });
  const hook = renderHook(() => useReduceMotion());
  expect(hook.result.current).toBe(true);
  act(() => onChange(true));
  await act(async () => resolveInitial(false));
  expect(hook.result.current).toBe(true);
  act(() => onChange(false));
  expect(hook.result.current).toBe(false);
  act(() => onChange(true));
  expect(hook.result.current).toBe(true);
  hook.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
