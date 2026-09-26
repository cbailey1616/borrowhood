import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { readDraft, saveDraft, deleteDraft } from '../utils/draftStorage';

export default function useFormDraft(scope, initial, { restoreAutomatically = true } = {}) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  const state = useRef({ scope, value, ready: false, changed: false, cleared: false });
  const latestInitial = useRef(initial);
  latestInitial.current = initial;
  const mounted = useRef(true);
  const persist = useCallback(async () => {
    const snapshot = state.current;
    if (!snapshot.scope || !snapshot.ready || snapshot.cleared) return false;
    if (!snapshot.changed) return true;
    try {
      await saveDraft(snapshot.scope, snapshot.value);
      if (mounted.current && state.current === snapshot) { setError(false); setSaved(true); }
      return true;
    } catch { if (mounted.current && state.current === snapshot) { setError(true); setSaved(false); } return false; }
  }, []);
  useEffect(() => {
    let active = true;
    state.current = { scope, value: latestInitial.current, ready: false, changed: false, cleared: false };
    setValue(latestInitial.current); setReady(false); setRestored(false); setSaved(false); setError(false); setPendingDraft(null);
    if (!scope) return;
    readDraft(scope).then(draft => {
      if (active && draft && !state.current.changed) {
        if (!restoreAutomatically) {
          // A new item starts empty; saved photos belong to the draft until resumed.
          setPendingDraft(draft);
          return;
        }
        const restoredValue = { ...latestInitial.current, ...draft };
        state.current.value = restoredValue;
        setValue(restoredValue); setRestored(true); setSaved(true);
      }
    }).catch(() => { if (active) setError(true); }).finally(() => {
      if (active) { state.current.ready = true; setReady(true); }
    });
    return () => { active = false; persist(); };
  }, [scope, persist, restoreAutomatically]);
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', status => { if (status !== 'active') persist(); });
    return () => { mounted.current = false; sub.remove(); persist(); };
  }, [persist]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(persist, 250);
    return () => clearTimeout(timer);
  }, [value, ready, persist]);
  const update = useCallback((next, { markChanged = true } = {}) => {
    if (state.current.scope !== scope) return;
    const updated = typeof next === 'function' ? next(state.current.value) : next;
    // Defaults loaded in the background must not overwrite a pending saved draft.
    state.current = { ...state.current, value: updated, changed: state.current.changed || markChanged, cleared: markChanged ? false : state.current.cleared };
    setValue(updated);
    if (markChanged) { setSaved(false); setPendingDraft(null); }
  }, [scope]);
  const resume = useCallback(() => {
    if (!pendingDraft || state.current.scope !== scope || !state.current.ready || state.current.changed) return;
    const restoredValue = { ...latestInitial.current, ...pendingDraft };
    state.current = { ...state.current, value: restoredValue, cleared: false };
    setValue(restoredValue); setRestored(true); setSaved(true); setPendingDraft(null);
  }, [scope, pendingDraft]);
  const clear = useCallback(async () => {
    if (state.current.scope !== scope) return false;
    const clearing = { ...state.current, cleared: true, changed: false };
    state.current = clearing;
    try {
      if (scope) await deleteDraft(scope);
      if (mounted.current && state.current === clearing) { setSaved(false); setRestored(false); setPendingDraft(null); }
      return true;
    } catch {
      if (mounted.current && state.current === clearing) setError(true);
      throw new Error('Could not remove the saved draft.');
    }
  }, [scope]);
  const discard = useCallback(async () => {
    if (!await clear() || state.current.scope !== scope || state.current.changed) return;
    state.current = { ...state.current, value: latestInitial.current, changed: false, cleared: true };
    setValue(latestInitial.current); setError(false);
  }, [clear, scope]);
  const retry = useCallback(() => state.current.scope === scope ? persist() : Promise.resolve(false), [scope, persist]);
  const prepareSubmission = useCallback(async (input, buildPayload) => {
    const assertScope = () => {
      if (!mounted.current || state.current.scope !== scope || !scope || !state.current.ready) {
        throw Object.assign(new Error('Your account changed. Please reopen this form.'), { code: 'SESSION_CHANGED' });
      }
    };
    assertScope();
    const { __submission, ...fields } = input;
    const fingerprint = JSON.stringify(fields);
    let pending = state.current.value.__submission;
    if (pending?.fingerprint !== fingerprint) {
      const payload = await buildPayload();
      assertScope();
      pending = { fingerprint, payload: { ...payload, clientRequestId: randomUUID() } };
      update(previous => ({ ...previous, __submission: pending }));
    }
    // Store the exact payload, including uploaded photo references, before POST.
    // Restoring this draft can then safely replay the original submission.
    if (!await persist()) throw new Error('Could not save your draft. Free some device storage and try again.');
    assertScope();
    return pending.payload;
  }, [scope, persist, update]);
  return [value, update, { ready, restored, error, saved, hasPendingDraft: Boolean(pendingDraft), resume, retry, clear, discard, prepareSubmission }];
}
