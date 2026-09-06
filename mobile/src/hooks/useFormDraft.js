import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { readDraft, saveDraft, deleteDraft } from '../utils/draftStorage';

export default function useFormDraft(scope, initial) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
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
    setValue(latestInitial.current); setReady(false); setRestored(false); setSaved(false); setError(false);
    if (!scope) return;
    readDraft(scope).then(draft => {
      if (active && draft && !state.current.changed) {
        const restoredValue = { ...latestInitial.current, ...draft };
        state.current.value = restoredValue;
        setValue(restoredValue); setRestored(true); setSaved(true);
      }
    }).catch(() => { if (active) setError(true); }).finally(() => {
      if (active) { state.current.ready = true; setReady(true); }
    });
    return () => { active = false; persist(); };
  }, [scope, persist]);
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
  const update = useCallback(next => {
    const updated = typeof next === 'function' ? next(state.current.value) : next;
    state.current = { ...state.current, value: updated, changed: true, cleared: false };
    setValue(updated); setSaved(false);
  }, []);
  const clear = useCallback(async () => {
    state.current = { ...state.current, cleared: true, changed: false };
    try { if (state.current.scope) await deleteDraft(state.current.scope); setSaved(false); setRestored(false); }
    catch { setError(true); throw new Error('Could not remove the saved draft.'); }
  }, []);
  const discard = useCallback(async () => {
    await clear();
    state.current = { ...state.current, value: latestInitial.current, changed: false, cleared: true };
    setValue(latestInitial.current); setError(false);
  }, [clear]);
  return [value, update, { ready, restored, error, saved, retry: persist, clear, discard }];
}
