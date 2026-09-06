import { renderHook, act } from '@testing-library/react-native';
import { ThemedAlert as Alert } from '../../../src/components/ThemedAlert';
import { UNSTABLE_usePreventRemove as preventRemove } from '@react-navigation/native';
import useUnsavedChanges from '../../../src/hooks/useUnsavedChanges';

it('guards changed values, preserves the cancelled edit, and allows successful saves', () => {
  const navigation = { goBack: jest.fn(), dispatch: jest.fn() };
  const alert = jest.spyOn(Alert, 'alert');
  const { result, rerender } = renderHook(({ title }) => useUnsavedChanges(navigation, { title }), { initialProps: { title: 'Original' } });
  expect(preventRemove.mock.calls.at(-1)[0]).toBe(false);
  rerender({ title: 'Edited' });
  const [blocked, callback] = preventRemove.mock.calls.at(-1);
  expect(blocked).toBe(true);
  const action = { type: 'GO_BACK' };
  act(() => callback({ data: { action } }));
  expect(alert.mock.calls.at(-1)[2][0].text).toBe('Keep editing');
  expect(navigation.dispatch).not.toHaveBeenCalled();
  act(() => alert.mock.calls.at(-1)[2][1].onPress());
  expect(navigation.dispatch).toHaveBeenCalledWith(action);
  act(() => result.current());
  expect(preventRemove.mock.calls.at(-1)[0]).toBe(false);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});
