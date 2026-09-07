import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeroIcon from '../components/HeroIcon';
import HapticPressable from '../components/HapticPressable';
import { Ionicons } from '../components/Icon';
import { useError } from '../context/ErrorContext';
import { alphaInviteMessage, inviteToAlpha } from '../utils/alphaInvite';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';

export default function InviteMembersScreen({ route }) {
  const insets = useSafeAreaInsets();
  const { showError } = useError();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const communityId = route.params?.communityId;
  useEffect(() => {
    let active = true;
    api.getCommunity(communityId).then(community => { if (active) setName(community?.name || ''); }).catch(() => {});
    return () => { active = false; };
  }, [communityId]);
  const invitation = `${alphaInviteMessage()}${name ? `\n\nOnce you're signed in, find ${name} under Neighborhoods and ask to join.` : ''}`;
  const invite = async byText => {
    if (busy) return;
    setBusy(true);
    try {
      if (byText) await inviteToAlpha(undefined, invitation);
      else await Share.share({ message: invitation });
    } catch (error) {
      showError({ message: 'Could not open your invitation. Please try again.' });
    } finally { setBusy(false); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl }]}>
    <View style={styles.art}><HeroIcon icon="people" size={96} /></View>
    <Text style={styles.title}>Good neighbors start here.</Text>
    <Text style={styles.body}>{name ? `Invite someone to share in ${name}.` : 'Invite a neighbor to try Borrowhood.'} Send the alpha invitation, then connect in the app.</Text>
    <View style={styles.card}>
      <HapticPressable style={styles.primary} disabled={busy} onPress={() => invite(true)}>
        <Ionicons name="chatbubble" size={22} color={COLORS.surface} />
        <Text style={styles.primaryText}>Invite by text</Text>
      </HapticPressable>
      <HapticPressable style={styles.secondary} disabled={busy} onPress={() => invite(false)}>
        <Ionicons name="share-outline" size={22} color={COLORS.primary} />
        <Text style={styles.secondaryText}>Share another way</Text>
      </HapticPressable>
      <Text style={styles.hint}>You choose the people and send the invitation from your messaging or email app.</Text>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  art: { alignItems: 'center', paddingVertical: SPACING.lg },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, textAlign: 'center' },
  body: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, gap: SPACING.md },
  primary: { minHeight: 52, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  primaryText: { ...TYPOGRAPHY.button, color: COLORS.surface, flexShrink: 1 },
  secondary: { minHeight: 52, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, borderColor: COLORS.borderGreen, borderWidth: 1, borderRadius: RADIUS.md },
  secondaryText: { ...TYPOGRAPHY.button, color: COLORS.primary, flexShrink: 1 },
  hint: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center' },
});
