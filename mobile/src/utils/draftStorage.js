import * as SecureStore from 'expo-secure-store';

// Account-scoped encrypted drafts. Chunk encoded ASCII to stay below native
// SecureStore value limits, including when a draft contains emoji or long notes.
const queues = new Map();
let generation = 0;
const baseKey = scope => `bh_draft_${Array.from(scope).map(c => c.codePointAt(0).toString(16)).join('_')}`;
const enqueue = (scope, task) => {
  const next = (queues.get(scope) || Promise.resolve()).catch(() => {}).then(task);
  queues.set(scope, next);
  next.finally(() => { if (queues.get(scope) === next) queues.delete(scope); }).catch(() => {});
  return next;
};
const manifest = async key => {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!Number.isInteger(data.count) || data.count < 1 || data.count > 100 || !/^[\d_]+$/.test(data.version)) throw new Error('Invalid draft');
  return data;
};
const removeChunks = (key, data) => data ? Promise.all(Array.from({ length: data.count }, (_, i) =>
  SecureStore.deleteItemAsync(`${key}_${data.version}_${i}`))) : Promise.resolve();

export const readDraft = scope => enqueue(scope, async () => {
  const key = baseKey(scope);
  const data = await manifest(key);
  if (!data) return null;
  const chunks = await Promise.all(Array.from({ length: data.count }, (_, i) => SecureStore.getItemAsync(`${key}_${data.version}_${i}`)));
  if (chunks.some(chunk => chunk == null)) throw new Error('Incomplete draft');
  return JSON.parse(decodeURIComponent(chunks.join('')));
});
export const saveDraft = (scope, value) => enqueue(scope, async () => {
  const key = baseKey(scope);
  const old = await manifest(key).catch(() => null);
  const encoded = encodeURIComponent(JSON.stringify(value));
  const chunks = encoded.match(/.{1,1500}/g) || [''];
  if (chunks.length > 100) throw new Error('Draft too large');
  const current = { version: `${Date.now()}_${generation++}`, count: chunks.length };
  try {
    for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(`${key}_${current.version}_${i}`, chunks[i]);
    // Publish the manifest last, so a failed save preserves the previous draft.
    await SecureStore.setItemAsync(key, JSON.stringify(current));
  } catch (error) {
    await removeChunks(key, current).catch(() => {});
    throw error;
  }
  await removeChunks(key, old).catch(() => {});
});
export const deleteDraft = scope => enqueue(scope, async () => {
  const key = baseKey(scope);
  const old = await manifest(key).catch(() => null);
  await SecureStore.deleteItemAsync(key);
  await removeChunks(key, old);
});
