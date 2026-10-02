import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import ActionButton from './ActionButton';
import ActionSheet from './ActionSheet';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';

// Content IDs, not author IDs, let unverified neighbors report/block a masked
// Town post without learning the author's identity.
export default function ContentSafetyActions({ type, id, onBlocked, open = false, onClose, label = 'Report or block', variant = 'button' }) {
  const [sheet, setSheet] = useState(open ? 'menu' : null);
  const currentSheet = useRef(open ? 'menu' : null);
  const showSheet = value => { currentSheet.current = value; setSheet(value); };
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async action => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await action(); }
    catch (error) { setFeedback({ title: 'Please try again', message: error.message || 'Could not save that action.' }); showSheet('feedback'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const report = reason => run(async () => {
    await api.reportContent(type, id, reason);
    setFeedback({ title: 'Report received', message: 'Borrowhood will review this content. Your report is private. For urgent help, contact chris@borrowhood.net.' });
    showSheet('feedback');
  });
  const block = () => run(async () => {
    await api.blockContentAuthor(type, id);
    setFeedback({ title: 'Neighbor blocked', message: 'Your profile, items and posts are hidden from this person, and their posts and public replies are hidden from you. New messages are blocked. Existing conversations and exchanges stay available.' });
    showSheet('feedback'); onBlocked?.();
  });
  const dialog = sheet === 'menu' ? {
    title: 'Safety options', actions: [
      { label: 'Report content', onPress: () => showSheet('report') },
      { label: 'Block this neighbor', onPress: () => showSheet('block') },
    ],
  } : sheet === 'report' ? {
    title: 'Report content', message: 'What is wrong with this post or message?',
    actions: ['Scam or fraud', 'Harassment', 'Unsafe behavior', 'Inappropriate content'].map(reason => ({ label: reason, onPress: () => report(reason) })),
  } : sheet === 'block' ? {
    title: 'Block this neighbor?', message: 'They won’t be able to see your profile, items or posts, or send you new messages. Their posts and public replies will be hidden from you too. Existing conversations and exchanges stay available.',
    actions: [{ label: 'Block neighbor', destructive: true, onPress: block }],
  } : { ...feedback, actions: [{ label: 'Done' }] };
  if (!id) return null;
  return <>
    {!open && (variant === 'subtle' ? <HapticPressable
      accessibilityLabel={label} accessibilityState={{ disabled: busy, busy }}
      disabled={busy} onPress={() => showSheet('menu')} style={styles.subtleAction}
    >
      {busy ? <ActivityIndicator size="small" color={COLORS.textSecondary} />
        : <Ionicons name="flag-outline" size={16} color={COLORS.textSecondary} />}
      <Text maxFontSizeMultiplier={1.4} style={styles.subtleLabel}>{label}</Text>
    </HapticPressable> : <ActionButton label={label} icon="flag-outline" loading={busy} onPress={() => showSheet('menu')} />)}
    {!!sheet && <ActionSheet key={sheet} isVisible {...dialog} onClose={() => {
      if (inFlight.current || currentSheet.current !== sheet) return;
      showSheet(null); onClose?.();
    }} />}
  </>;
}

const styles = StyleSheet.create({
  subtleAction: {
    minHeight: 44, maxWidth: '100%', alignSelf: 'center', marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
  },
  subtleLabel: { ...TYPOGRAPHY.buttonCaption, color: COLORS.textSecondary, flexShrink: 1, textAlign: 'center' },
});
