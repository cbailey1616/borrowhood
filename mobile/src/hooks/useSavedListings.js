import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

// One saved-list read per visit, not one request per visible card.
export default function useSavedListings(navigation, userId, { showToast, showError }) {
  const [savedIds, setSavedIds] = useState(new Set());
  const [pendingIds, setPendingIds] = useState(new Set());
  const [status, setStatus] = useState('loading');
  const lifecycle = useRef(null);

  const refresh = useCallback(async () => {
    const session = lifecycle.current;
    if (!session || session.pending.size) return;
    const revision = ++session.revision;
    session.ready = false;
    setStatus('loading');
    try {
      const listings = await api.getSavedListings();
      if (lifecycle.current !== session || session.revision !== revision) return;
      if (!Array.isArray(listings)) throw new Error('Invalid saved items response');
      session.saved = new Set(listings.map(item => item.id));
      session.ready = true;
      setSavedIds(session.saved);
      setStatus('ready');
    } catch {
      if (lifecycle.current !== session || session.revision !== revision) return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    lifecycle.current = { saved: new Set(), pending: new Set(), revision: 0, ready: false };
    setSavedIds(new Set());
    setPendingIds(new Set());
    refresh();
    const unsubscribe = navigation.addListener('focus', refresh);
    return () => { lifecycle.current = null; unsubscribe?.(); };
  }, [navigation, userId, refresh]);

  const toggle = async id => {
    const session = lifecycle.current;
    if (!session || session.pending.has(id)) return;
    if (!session.ready) { await refresh(); return; }
    const wasSaved = session.saved.has(id);
    session.pending.add(id);
    ++session.revision;
    setPendingIds(new Set(session.pending));
    try {
      if (wasSaved) await api.unsaveListing(id);
      else await api.saveListing(id);
      if (lifecycle.current !== session) return;
      const next = new Set(session.saved);
      if (wasSaved) next.delete(id); else next.add(id);
      session.saved = next;
      setSavedIds(next);
      showToast(wasSaved ? 'Removed from Saved' : 'Added to Saved', 'success');
    } catch {
      if (lifecycle.current !== session) return;
      // A network failure may follow a successful write. Recheck before another toggle.
      session.ready = false;
      showError({ message: 'Couldn’t confirm that change. We’ll check your saved items before you try again.' });
    } finally {
      if (lifecycle.current === session) {
        session.pending.delete(id);
        setPendingIds(new Set(session.pending));
        if (!session.pending.size) refresh();
      }
    }
  };

  return { savedIds, pendingIds, status, toggle, refresh };
}
