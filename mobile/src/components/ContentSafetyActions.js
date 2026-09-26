import React, { useRef, useState } from 'react';
import ActionButton from './ActionButton';
import ActionSheet from './ActionSheet';
import api from '../services/api';

// Content IDs, not author IDs, let unverified neighbors report/block a masked
// Town post without learning the author's identity.
export default function ContentSafetyActions({ type, id, onBlocked, open = false, onClose, label = 'Report or block' }) {
  const [sheet, setSheet] = useState(open ? 'menu' : null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async action => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await action(); }
    catch (error) { setFeedback({ title: 'Please try again', message: error.message || 'Could not save that action.' }); setSheet('feedback'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const report = reason => run(async () => {
    await api.reportContent(type, id, reason);
    setFeedback({ title: 'Report received', message: 'Borrowhood will review this content. Your report is private. For urgent help, contact chris@borrowhood.net.' });
    setSheet('feedback');
  });
  const block = () => run(async () => {
    await api.blockContentAuthor(type, id);
    setFeedback({ title: 'Neighbor blocked', message: 'Their posts and public replies will be hidden. You can’t send each other new messages. Existing exchanges remain available.' });
    setSheet('feedback'); onBlocked?.();
  });
  const dialog = sheet === 'menu' ? {
    title: 'Safety options', actions: [
      { label: 'Report content', onPress: () => setSheet('report') },
      { label: 'Block this neighbor', onPress: () => setSheet('block') },
    ],
  } : sheet === 'report' ? {
    title: 'Report content', message: 'What is wrong with this post or message?',
    actions: ['Scam or fraud', 'Harassment', 'Unsafe behavior', 'Inappropriate content'].map(reason => ({ label: reason, onPress: () => report(reason) })),
  } : sheet === 'block' ? {
    title: 'Block this neighbor?', message: 'Their posts and public replies will be hidden. Existing exchanges remain available.',
    actions: [{ label: 'Block neighbor', destructive: true, onPress: block }],
  } : { ...feedback, actions: [{ label: 'Done' }] };
  if (!id) return null;
  return <>
    {!open && <ActionButton label={label} icon="flag-outline" loading={busy} onPress={() => setSheet('menu')} />}
    {!!sheet && <ActionSheet key={sheet} isVisible {...dialog} onClose={() => {
      if (inFlight.current) return;
      setSheet(current => { if (current !== sheet) return current; onClose?.(); return null; });
    }} />}
  </>;
}
