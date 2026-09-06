import { renderHook, act, waitFor } from '@testing-library/react-native';
import useFormDraft from '../../../src/hooks/useFormDraft';
import { readDraft, saveDraft, deleteDraft } from '../../../src/utils/draftStorage';
jest.mock('../../../src/utils/draftStorage', () => ({ readDraft: jest.fn(), saveDraft: jest.fn(), deleteDraft: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); readDraft.mockResolvedValue(null); saveDraft.mockResolvedValue(); deleteDraft.mockResolvedValue(); });

it('restores a saved form when reopened', async () => {
  readDraft.mockResolvedValue({ title: 'My ladder', visibility: ['private'] });
  const { result } = renderHook(() => useFormDraft('a.item', { title: '', condition: 'good' }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  expect(result.current[0]).toEqual({ title: 'My ladder', condition: 'good', visibility: ['private'] });
  expect(result.current[2].restored).toBe(true);
});
it('does not replace typing with a late stored draft', async () => {
  let finish;
  readDraft.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useFormDraft('a.item', { title: '' }));
  act(() => result.current[1]({ title: 'New typing' }));
  await act(async () => finish({ title: 'Older typing' }));
  expect(result.current[0].title).toBe('New typing');
});
it('flushes the latest input before leaving and does not re-save a cleared draft', async () => {
  const { result, unmount } = renderHook(() => useFormDraft('a.item', { title: '' }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  act(() => result.current[1]({ title: 'Saved' }));
  await act(async () => { expect(await result.current[2].retry()).toBe(true); });
  expect(saveDraft).toHaveBeenCalledWith('a.item', { title: 'Saved' });
  await act(async () => { await result.current[2].clear(); });
  saveDraft.mockClear();
  unmount();
  expect(deleteDraft).toHaveBeenCalledWith('a.item');
  expect(saveDraft).not.toHaveBeenCalled();
});
it('reports failed persistence instead of claiming a draft was saved', async () => {
  saveDraft.mockRejectedValue(new Error('full'));
  const { result } = renderHook(() => useFormDraft('a.item', { title: '' }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  act(() => result.current[1]({ title: 'Keep me' }));
  await act(async () => { expect(await result.current[2].retry()).toBe(false); });
  expect(result.current[2].error).toBe(true);
  expect(result.current[2].saved).toBe(false);
});

it('starts fresh after a confirmed discard and allows saving new edits', async () => {
  readDraft.mockResolvedValue({ title: 'Old draft' });
  const { result } = renderHook(() => useFormDraft('a.item', { title: '', visibility: ['private'] }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  await act(async () => result.current[2].discard());
  expect(result.current[0]).toEqual({ title: '', visibility: ['private'] });
  expect(result.current[2].restored).toBe(false);
  act(() => result.current[1](value => ({ ...value, title: 'New item' })));
  await act(async () => { await result.current[2].retry(); });
  expect(saveDraft).toHaveBeenCalledWith('a.item', { title: 'New item', visibility: ['private'] });
});
