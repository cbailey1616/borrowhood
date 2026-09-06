import * as SecureStore from 'expo-secure-store';
import { readDraft, saveDraft, deleteDraft } from '../../src/utils/draftStorage';

let values;
beforeEach(() => {
  values = new Map();
  SecureStore.getItemAsync.mockImplementation(async key => values.get(key) ?? null);
  SecureStore.setItemAsync.mockImplementation(async (key, value) => { values.set(key, value); });
  SecureStore.deleteItemAsync.mockImplementation(async key => { values.delete(key); });
});

it('round trips long Unicode notes with native-safe chunk sizes', async () => {
  const value = { title: '🌿 Garden tools', description: 'Thanks neighbor! 🦊'.repeat(300) };
  await saveDraft('user-a.item', value);
  expect(await readDraft('user-a.item')).toEqual(value);
  expect([...values.values()].every(chunk => chunk.length <= 1500)).toBe(true);
});
it('isolates accounts and forms', async () => {
  await saveDraft('a.item', { title: 'Private' });
  expect(await readDraft('b.item')).toBeNull();
  expect(await readDraft('a.request')).toBeNull();
});
it('preserves the previous draft if a new save is interrupted', async () => {
  await saveDraft('a.item', { title: 'Original' });
  SecureStore.setItemAsync.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(saveDraft('a.item', { title: 'New' })).rejects.toThrow();
  expect(await readDraft('a.item')).toEqual({ title: 'Original' });
});
it('serializes save and clear so delayed writes cannot resurrect a draft', async () => {
  const first = saveDraft('a.item', { title: 'First' });
  const second = saveDraft('a.item', { title: 'Second' });
  const cleared = deleteDraft('a.item');
  await Promise.all([first, second, cleared]);
  expect(await readDraft('a.item')).toBeNull();
  expect(values.size).toBe(0);
});
it('detects a missing chunk instead of silently restoring an empty form', async () => {
  await saveDraft('a.item', { title: 'Original' });
  const chunkKey = [...values.keys()].find(key => !values.get(key).startsWith('{'));
  values.delete(chunkKey);
  await expect(readDraft('a.item')).rejects.toThrow('Incomplete draft');
});
