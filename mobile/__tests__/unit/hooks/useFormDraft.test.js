import { renderHook, act, waitFor } from '@testing-library/react-native';
import useFormDraft from '../../../src/hooks/useFormDraft';
import { readDraft, saveDraft, deleteDraft } from '../../../src/utils/draftStorage';
jest.mock('../../../src/utils/draftStorage', () => ({ readDraft: jest.fn(), saveDraft: jest.fn(), deleteDraft: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); readDraft.mockResolvedValue(null); saveDraft.mockResolvedValue(); deleteDraft.mockResolvedValue(); });

it('leaves photos out of a new form until the saved draft is explicitly resumed', async () => {
  const savedDraft = { title: 'Old ladder', photos: ['file:///ladder.jpg'], visibility: ['private'] };
  readDraft.mockResolvedValue(savedDraft);
  const { result, unmount } = renderHook(() => useFormDraft('a.item', { title: '', photos: [], visibility: ['close_friends'] }, { restoreAutomatically: false }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  expect(result.current[0].photos).toEqual([]);
  expect(result.current[2].hasPendingDraft).toBe(true);
  // Automatic audience defaults must not overwrite an unfinished item's photos.
  act(() => result.current[1](previous => ({ ...previous, visibility: ['town'] }), { markChanged: false }));
  await act(async () => result.current[2].retry());
  expect(saveDraft).not.toHaveBeenCalled();
  act(() => result.current[2].resume());
  expect(result.current[0]).toEqual(savedDraft);
  expect(result.current[2].restored).toBe(true);
  expect(result.current[2].hasPendingDraft).toBe(false);
  unmount();
  expect(saveDraft).not.toHaveBeenCalled();
});

it('does not let a stale resume action replace edits to a new item', async () => {
  readDraft.mockResolvedValue({ title: 'Old ladder', photos: ['old-photo'] });
  const { result } = renderHook(() => useFormDraft('a.item', { title: '', photos: [] }, { restoreAutomatically: false }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  const resume = result.current[2].resume;
  act(() => result.current[1]({ title: 'New drill', photos: ['new-photo'] }));
  act(() => resume());
  expect(result.current[0]).toEqual({ title: 'New drill', photos: ['new-photo'] });
  expect(result.current[2].hasPendingDraft).toBe(false);
  await act(async () => result.current[2].retry());
  expect(saveDraft).toHaveBeenLastCalledWith('a.item', { title: 'New drill', photos: ['new-photo'] });
});

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

it('ignores updates and cleanup callbacks belonging to a previous account', async () => {
  const { result, rerender } = renderHook(({ scope }) => useFormDraft(scope, { title: '' }), { initialProps: { scope: 'a.item' } });
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  const old = result.current;
  rerender({ scope: 'b.item' });
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  act(() => result.current[1]({ title: 'Account B draft' }));
  act(() => old[1]({ title: 'Late account A edit' }));
  await act(async () => old[2].clear());
  expect(deleteDraft).not.toHaveBeenCalledWith('b.item');
  expect(result.current[0].title).toBe('Account B draft');
});

it('does not erase a new account draft when a previous discard finishes', async () => {
  let finish;
  deleteDraft.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ scope }) => useFormDraft(scope, { title: '' }), { initialProps: { scope: 'a.item' } });
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  let discard;
  act(() => { discard = result.current[2].discard(); });
  rerender({ scope: 'b.item' });
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  act(() => result.current[1]({ title: 'Keep B' }));
  await act(async () => { finish(); await discard; });
  expect(result.current[0].title).toBe('Keep B');
  expect(deleteDraft).toHaveBeenCalledWith('a.item');
});

it('reuses the exact saved submission after reopening, including uploaded photos', async () => {
  const build = jest.fn().mockResolvedValue({ title: 'Ladder', photos: ['stored-photo'] });
  const first = renderHook(() => useFormDraft('a.item', { title: 'Ladder' }));
  await waitFor(() => expect(first.result.current[2].ready).toBe(true));
  let payload;
  await act(async () => { payload = await first.result.current[2].prepareSubmission(first.result.current[0], build); });
  expect(payload).toEqual({ title: 'Ladder', photos: ['stored-photo'], clientRequestId: expect.any(String) });
  const saved = saveDraft.mock.calls.at(-1)[1];
  first.unmount();
  readDraft.mockResolvedValue(saved);
  const second = renderHook(() => useFormDraft('a.item', { title: '' }));
  await waitFor(() => expect(second.result.current[2].ready).toBe(true));
  await act(async () => { expect(await second.result.current[2].prepareSubmission(second.result.current[0], build)).toEqual(payload); });
  expect(build).toHaveBeenCalledTimes(1);
});

it('prepares a new submission only after the input changes', async () => {
  const { randomUUID } = require('expo-crypto');
  randomUUID.mockReturnValueOnce('first-attempt').mockReturnValueOnce('second-attempt');
  const { result } = renderHook(() => useFormDraft('a.item', { title: 'Ladder' }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  let first, second;
  await act(async () => { first = await result.current[2].prepareSubmission(result.current[0], async () => ({ title: 'Ladder' })); });
  act(() => result.current[1](previous => ({ ...previous, title: 'Drill' })));
  await act(async () => { second = await result.current[2].prepareSubmission(result.current[0], async () => ({ title: 'Drill' })); });
  expect(first.clientRequestId).not.toBe(second.clientRequestId);
  expect(second.title).toBe('Drill');
});

it('blocks publication when its retry information could not be saved', async () => {
  saveDraft.mockRejectedValue(new Error('Device full'));
  const { result } = renderHook(() => useFormDraft('a.item', { title: 'Ladder' }));
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  await act(async () => {
    await expect(result.current[2].prepareSubmission(result.current[0], async () => ({ title: 'Ladder' }))).rejects.toThrow('Could not save your draft');
  });
});

it('does not save or publish an upload that finished in another account', async () => {
  let finish;
  const build = () => new Promise(resolve => { finish = resolve; });
  const { result, rerender } = renderHook(({ scope }) => useFormDraft(scope, { title: 'Ladder' }), { initialProps: { scope: 'a.item' } });
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  const pending = result.current[2].prepareSubmission(result.current[0], build);
  rerender({ scope: 'b.item' });
  await waitFor(() => expect(result.current[2].ready).toBe(true));
  await act(async () => { finish({ photos: ['account-a-photo'] }); await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' }); });
  expect(saveDraft).not.toHaveBeenCalled();
});
