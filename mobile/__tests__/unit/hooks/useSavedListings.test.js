import { renderHook, act, waitFor } from '@testing-library/react-native';
import useSavedListings from '../../../src/hooks/useSavedListings';
import api from '../../../src/services/api';

let focus;
const navigation = { addListener: jest.fn((event, callback) => { focus = callback; return jest.fn(); }) };
const feedback = { showToast: jest.fn(), showError: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  api.getSavedListings.mockResolvedValue([]);
  api.saveListing.mockResolvedValue({ saved: true });
  api.unsaveListing.mockResolvedValue({ saved: false });
});

it('refreshes saves made elsewhere when Home regains focus', async () => {
  const { result } = renderHook(() => useSavedListings(navigation, 'user-a', feedback));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  api.getSavedListings.mockResolvedValue([{ id: 'ladder' }]);
  await act(async () => focus());
  expect(result.current.savedIds.has('ladder')).toBe(true);
});

it('blocks duplicate taps while a save is pending', async () => {
  let complete;
  api.saveListing.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const { result } = renderHook(() => useSavedListings(navigation, 'user-a', feedback));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  let pending;
  act(() => { pending = result.current.toggle('ladder'); result.current.toggle('ladder'); });
  expect(api.saveListing).toHaveBeenCalledTimes(1);
  expect(result.current.pendingIds.has('ladder')).toBe(true);
  api.getSavedListings.mockResolvedValue([{ id: 'ladder' }]);
  await act(async () => { complete({ saved: true }); await pending; });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.savedIds.has('ladder')).toBe(true);
});

it('rechecks an uncertain write instead of reporting success or toggling blindly', async () => {
  const { result } = renderHook(() => useSavedListings(navigation, 'user-a', feedback));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  api.saveListing.mockRejectedValue(new Error('Network lost'));
  api.getSavedListings.mockResolvedValue([{ id: 'ladder' }]);
  await act(async () => result.current.toggle('ladder'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(feedback.showError).toHaveBeenCalled();
  expect(feedback.showToast).not.toHaveBeenCalled();
  expect(result.current.savedIds.has('ladder')).toBe(true);
});

it('does not let a late previous-account response overwrite current saves', async () => {
  let complete;
  api.getSavedListings.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const { result, rerender } = renderHook(({ id }) => useSavedListings(navigation, id, feedback), { initialProps: { id: 'user-a' } });
  rerender({ id: 'user-b' });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(async () => complete([{ id: 'previous-user-item' }]));
  expect(result.current.savedIds.size).toBe(0);
});
