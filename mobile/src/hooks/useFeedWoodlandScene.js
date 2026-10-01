import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { FEED_WOODLAND_SCENES } from '../assets/feed-woodland-scenes';

// SecureStore keys permit letters, digits, dots, dashes and underscores.
const storageKey = userId => `feedWoodland_${Array.from(String(userId), c => c.codePointAt(0).toString(16)).join('-')}`;

// Owned by AuthProvider, so tab changes and Feed remounts cannot advance it.
// A restored sign-in on a fresh app launch also starts a new scene session.
export default function useFeedWoodlandScene(userId, isAuthenticated) {
  const [selected, setSelected] = useState({ userId: null, index: 0 });
  const session = useRef(null);
  const lastScenes = useRef(new Map());
  const pending = useRef(Promise.resolve());

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      session.current = null;
      setSelected({ userId: null, index: 0 });
      return;
    }

    let current = session.current;
    if (!current || current.userId !== userId) {
      const selectNext = async () => {
        let previous = lastScenes.current.get(userId);
        if (previous === undefined) {
          let stored;
          try { stored = await SecureStore.getItemAsync(storageKey(userId)); }
          catch { /* Decorations never interrupt sign-in. */ }
          previous = FEED_WOODLAND_SCENES.findIndex(scene => scene.id === stored);
        }
        const index = (previous + 1) % FEED_WOODLAND_SCENES.length;
        lastScenes.current.set(userId, index);
        try { await SecureStore.setItemAsync(storageKey(userId), FEED_WOODLAND_SCENES[index].id); }
        catch { /* Keep cycling in memory if local storage is unavailable. */ }
        return index;
      };
      const selection = pending.current.then(selectNext);
      pending.current = selection.catch(() => {});
      current = { userId, selection };
      session.current = current;
    }

    let active = true;
    current.selection.then(index => {
      if (active && session.current === current) setSelected({ userId, index });
    }).catch(() => {});
    // Reusing the session promise also prevents Strict Mode's effect replay
    // from advancing twice. Stale reads cannot repaint another account.
    return () => { active = false; };
  }, [userId, isAuthenticated]);

  return isAuthenticated && selected.userId === userId ? selected.index : 0;
}
