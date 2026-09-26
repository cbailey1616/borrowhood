import { useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import OnboardingLayout from '../../components/OnboardingLayout';
import LayeredCard from '../../components/LayeredCard';
import Icon from '../../components/Icon';
import VerifiedBadge from '../../components/VerifiedBadge';
import HapticPressable from '../../components/HapticPressable';
import api from '../../services/api';
import { BASE_URL, COLORS, RADIUS, TYPOGRAPHY } from '../../utils/config';

const Point = ({ icon, title, children, tone = COLORS.primaryMuted }) => (
  <View style={styles.pointRow}>
    <View style={[styles.pointIcon, { backgroundColor: tone }]}>
      {icon === 'identity-seal' ? <VerifiedBadge size={27} /> : <Icon name={icon} size={27} illustrated />}
    </View>
    <View style={styles.pointCopy}>
      <Text accessibilityRole="header" style={styles.point}>{title}</Text>
      <Text style={styles.detail}>{children}</Text>
    </View>
  </View>
);

export default function OnboardingIntroScreen({ navigation }) {
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = async () => {
    if (busy) return;
    if (page === 0) { setPage(1); return; }
    setBusy(true); setError('');
    try {
      await api.updateOnboardingStep(2);
      navigation.navigate('OnboardingNeighborhood');
    } catch { setError('Could not save your progress. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <OnboardingLayout
      step={page + 1}
      compact={page === 1}
      title={page === 0 ? 'Good things.\nCloser to home.' : 'Your things.\nYour choice.'}
      description={page === 0 ? 'Borrow what you need. Share what you have.' : 'Choose friends, your neighborhood, or town. Keep other items private.'}
      scene={page === 0 ? 'onboardingShare' : 'onboardingAudience'}
      tone={page === 0 ? COLORS.primaryMuted : COLORS.infoMuted}
      buttonLabel={page === 0 ? 'Continue' : 'Choose your town'}
      onContinue={next} busy={busy} error={error}
      note="Get started now. Verify your identity later."
      secondaryActions={page === 1 ? <View style={styles.footerLinks}>
        <HapticPressable accessibilityRole="button" onPress={() => { setPage(0); setError(''); }} disabled={busy} style={styles.linkButton}>
          <Text style={styles.link}>Back</Text>
        </HapticPressable>
        <HapticPressable accessibilityRole="link" onPress={() => Linking.openURL(BASE_URL + '/privacy').catch(() => setError('Could not open the Privacy Policy. Please try again.'))} style={styles.linkButton}>
          <Text style={styles.link}>Privacy Policy</Text>
        </HapticPressable>
      </View> : null}>
      {page === 1 && <View style={styles.audiences}>
        {[['people', 'Friends'], ['home', 'Neighborhood'], ['location', 'Town']].map(([icon, label]) => (
          <View key={label} style={styles.audience}>
            <Icon name={icon} size={19} illustrated />
            <Text style={styles.audienceLabel}>{label}</Text>
          </View>
        ))}
      </View>}
      <LayeredCard style={styles.card} radius={RADIUS.xl}>
        {page === 0 ? <>
          <Point icon="chatbubble" title="Ask before you buy" tone={COLORS.infoMuted}>Someone nearby may have just the thing.</Point>
          <View style={styles.divider} />
          <Point icon="gift" title="Lend, give away, or sell" tone={COLORS.warningMuted}>Give your things a little more use. Giveaways are free.</Point>
          <View style={styles.divider} />
          <Point icon="people" title="Get to know your neighbors" tone={COLORS.accentMuted}>A small exchange can start a good connection.</Point>
        </> : <>
          <Point icon="identity-seal" title="Look for the verified badge" tone={COLORS.warningMuted}>It means an identity was checked. You can verify later.</Point>
          <View style={styles.divider} />
          <Point icon="chatbubble" title="Make plans in private" tone={COLORS.infoMuted}>Agree on pickup and share details in a private chat.</Point>
        </>}
      </LayeredCard>
    </OnboardingLayout>
  );
}
const styles = StyleSheet.create({
  card: { width: '100%', paddingHorizontal: 18, paddingVertical: 6 },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 16 },
  pointIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pointCopy: { flex: 1, gap: 5 },
  point: { ...TYPOGRAPHY.body, color: COLORS.primaryDark },
  detail: { ...TYPOGRAPHY.bodySmall, lineHeight: 20, color: COLORS.textSecondary },
  divider: { marginLeft: 57, height: 1, backgroundColor: COLORS.borderLight },
  audiences: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 18 },
  audience: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.surface },
  audienceLabel: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  footerLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  link: { ...TYPOGRAPHY.subheadline, color: COLORS.primary },
});
