import React, { useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import HapticPressable from './HapticPressable';
import ActionSheet from './ActionSheet';
import { Ionicons } from './Icon';
import { COLORS, SPACING } from '../utils/config';
import api from '../services/api';

export default function UserSafetyActions({ userId, name = 'this person', label = 'Report or block', onBlockChange }) {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const inFlight = useRef(false);
  const run = async action => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try { await action(); }
    catch { setFeedback({ title: 'Please try again', message: 'We couldn’t complete that action. Please try again.' }); setSheet('feedback'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const open = () => run(async () => {
    const result = await api.getUserSafety(userId);
    setBlocked(result.blocked);
    setSheet('menu');
  });
  const toggleBlock = () => run(async () => {
    if (blocked) await api.unblockUser(userId); else await api.blockUser(userId);
    const next = !blocked;
    setBlocked(next);
    onBlockChange?.(next);
    setFeedback({ title: next ? 'User blocked' : 'User unblocked', message: next
      ? 'You can’t send each other new messages. Existing conversations and borrows stay available.'
      : 'You can message each other again.' });
    setSheet('feedback');
  });
  const report = reason => run(async () => {
    await api.reportUser(userId, reason);
    setFeedback({ title: 'Thank you for letting us know', message: 'Your report has been recorded. You can also block this person from the profile menu.' });
    setSheet('feedback');
  });
  if (!userId) return null;
  const dialog = sheet === 'menu' ? {
    title: name === 'this person' ? 'Safety options' : name,
    actions: [
      { label: 'Report user', icon: <Ionicons name="flag-outline" size={24} />, onPress: () => setSheet('report') },
      { label: blocked ? 'Unblock user' : 'Block user', icon: <Ionicons name="shield-outline" size={24} />, onPress: () => setSheet('block') },
    ],
  } : sheet === 'report' ? {
    title: 'Report user', message: 'What would you like us to know?',
    actions: ['Scam or fraud', 'Harassment', 'Unsafe behavior'].map(reason => ({ label: reason, onPress: () => report(reason) })),
  } : sheet === 'block' ? {
    title: `${blocked ? 'Unblock' : 'Block'} ${name}?`,
    message: blocked ? 'You’ll be able to message each other again.' : 'You won’t be able to message each other. Existing conversations and borrows stay available.',
    cancelLabel: 'Not now',
    actions: [{ label: blocked ? 'Unblock user' : 'Block user', destructive: !blocked, onPress: toggleBlock }],
  } : { ...feedback, actions: [{ label: 'Got it' }] };
  return <>
    <HapticPressable accessibilityRole="button" accessibilityLabel={label === 'More' ? 'More profile options' : label}
      disabled={busy} onPress={open}
      style={{ minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md }}>
      {busy ? <ActivityIndicator size="small" color={COLORS.primary} /> : <>
        {label === 'More' && <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.primary} />}
        <Text style={{ color: COLORS.primary }}>{label}</Text>
      </>}
    </HapticPressable>
    {sheet && <ActionSheet key={sheet} isVisible {...dialog}
      onClose={() => setSheet(current => current === sheet ? null : current)} />}
  </>;
}
