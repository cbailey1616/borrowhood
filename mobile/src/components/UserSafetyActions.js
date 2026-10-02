import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import ActionButton from './ActionButton';
import ActionSheet from './ActionSheet';
import HapticPressable from './HapticPressable';
import LayeredCard from './LayeredCard';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';

function SafetyRow({ icon, iconBg, fillColor, title, description, onPress, disabled, loading, isLast }) {
  return <HapticPressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description}
    disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} scaleDown={1}
    pressedBackgroundColor={COLORS.cardHover} style={styles.row}>
    <View style={[styles.iconWell, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={28} illustrated color={COLORS.primary} fillColor={fillColor} />
    </View>
    <View style={styles.copy}><Text maxFontSizeMultiplier={1.4} style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text></View>
    {loading ? <ActivityIndicator color={COLORS.spinner} />
      : <Ionicons name="chevron-forward" size={18} illustrated={false} color={COLORS.textMuted} />}
    {!isLast && <View style={styles.separator} />}
  </HapticPressable>;
}

export default function UserSafetyActions({ userId, name = 'this person', label = 'Report or block', variant = 'button', onBlockChange }) {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const inFlight = useRef(false);
  useEffect(() => {
    let current = true;
    if (variant === 'section' && userId) api.getUserSafety(userId).then(result => {
      if (current) { setBlocked(result.blocked); onBlockChange?.(result.blocked); }
    }).catch(() => {});
    return () => { current = false; };
  }, [userId, variant]);
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
      ? 'Your profile and posts are hidden from this person, and new messages are blocked. Existing conversations and exchanges stay available.'
      : 'They can see your profile and posts shared with them, and you can message each other again.' });
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
      { label: 'Report user', icon: <Ionicons name="flag-outline" size={24} illustrated fillColor={COLORS.illustration.honey} />, onPress: () => setSheet('report') },
      { label: blocked ? 'Unblock user' : 'Block user', icon: <Ionicons name={blocked ? 'chatbubble-outline' : 'block-person-outline'} size={24} illustrated />, onPress: () => setSheet('block') },
    ],
  } : sheet === 'report' ? {
    title: 'Report user', message: 'What would you like us to know?',
    icon: <Ionicons name="flag-outline" size={28} illustrated fillColor={COLORS.illustration.honey} />,
    actions: ['Scam or fraud', 'Harassment', 'Unsafe behavior', 'Inappropriate content'].map(reason => ({ label: reason, onPress: () => report(reason) })),
  } : sheet === 'block' ? {
    title: `${blocked ? 'Unblock' : 'Block'} ${name}?`,
    icon: <Ionicons name={blocked ? 'chatbubble-outline' : 'block-person-outline'} size={28} illustrated />,
    message: blocked ? 'They’ll be able to see your profile and posts shared with them, and you can message each other again.' : 'They won’t be able to see your profile, items or posts, or send you new messages. Their posts will be hidden from you too. Existing conversations and exchanges stay available.',
    cancelLabel: 'Not now',
    actions: [{ label: blocked ? 'Unblock user' : 'Block user', destructive: !blocked, onPress: toggleBlock }],
  } : { ...feedback, actions: [{ label: 'Got it' }] };
  return <>
    {variant === 'section' ? <View style={styles.section}>
      <Text style={styles.heading}>Safety</Text>
      <LayeredCard><View style={styles.rows}>
        <SafetyRow icon="flag-outline" iconBg={COLORS.warningMuted} fillColor={COLORS.illustration.honey}
          title="Report user" description="Private account review" disabled={busy} onPress={() => setSheet('report')} />
        <SafetyRow icon={blocked ? 'chatbubble-outline' : 'block-person-outline'} iconBg={blocked ? COLORS.primaryMuted : COLORS.dangerMuted}
          fillColor={blocked ? COLORS.illustration.sage : COLORS.illustration.clay} title={blocked ? 'Unblock user' : 'Block user'}
          description={blocked ? 'Restore access and messages' : 'Hide your profile and posts'} disabled={busy} loading={busy} isLast
          onPress={() => run(async () => {
            const result = await api.getUserSafety(userId); setBlocked(result.blocked); setSheet('block');
          })} />
      </View></LayeredCard>
      <Text style={styles.footer}>Blocking hides your profile and posts and stops new messages. Existing conversations and exchanges stay available.</Text>
    </View> :
    <ActionButton label={label} icon="shield-outline" accessibilityLabel={label === 'More' ? 'More profile options' : label}
      loading={busy} onPress={open} style={{ minHeight: 44, minWidth: 44 }} />}
    {sheet && <ActionSheet key={sheet} isVisible {...dialog}
      onClose={() => setSheet(current => current === sheet ? null : current)} />}
  </>;
}

const styles = StyleSheet.create({
  section: { marginBottom: SPACING.xl },
  heading: { ...TYPOGRAPHY.footnote, fontFamily: 'DMSans_500Medium', fontWeight: '500',
    color: COLORS.textMuted, marginLeft: SPACING.lg, marginBottom: SPACING.sm },
  rows: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden' },
  row: { minHeight: 80, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  iconWell: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 }, title: { ...TYPOGRAPHY.button, color: COLORS.primary },
  description: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  separator: { position: 'absolute', bottom: 0, left: SPACING.lg + 44 + SPACING.md,
    right: SPACING.lg, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator },
  footer: { ...TYPOGRAPHY.caption1, color: COLORS.textMuted, marginTop: SPACING.md, marginHorizontal: SPACING.lg },
});
