import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WoodlandIllustration from '../../components/WoodlandIllustration';
import Icon from '../../components/Icon';
import VerifiedBadge from '../../components/VerifiedBadge';
import HapticPressable from '../../components/HapticPressable';
import api from '../../services/api';
import { BASE_URL, COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

const Point = ({ icon, title, children }) => (
  <View style={styles.pointRow}>
    {icon === 'identity-seal' ? <VerifiedBadge size={28} /> : <Icon name={icon} size={28} illustrated />}
    <View style={styles.pointCopy}><Text accessibilityRole="header" style={styles.point}>{title}</Text><Text style={styles.detail}>{children}</Text></View>
  </View>
);
export default function OnboardingIntroScreen({ navigation }) {
  const insets = useSafeAreaInsets();
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
    <ScrollView key={page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <View style={styles.illustrationFrame}>
          <WoodlandIllustration scene="neighborhood" width={190} style={styles.illustration} />
        </View>
        <Text accessibilityLabel={`Introduction, page ${page + 1} of 2`} style={styles.step}>{page + 1} OF 2</Text>
        <Text accessibilityRole="header" style={styles.title}>{page === 0 ? 'Good things.\nCloser to home.' : 'Friends.\nNeighborhood. Town.'}</Text>
        <Text style={styles.body}>{page === 0 ? 'Borrow what you need. Share what you have.' : 'Choose who you share with, from people you know to neighbors nearby.'}</Text>
      </View>
      <View style={styles.card}>
        {page === 0 ? <>
          <Point icon="chatbubble" title="Ask before you buy">Tell neighbors what you need. Someone nearby may have just the thing.</Point>
          <Point icon="gift" title="Lend, give away, or sell">A little more use from things you already own. Giveaways are always free.</Point>
          <Point icon="people" title="Get to know your neighbors">Make connections with every exchange.</Point>
        </> : <>
          <Point icon="people" title="Your listing. Your audience.">Share with friends, neighborhood groups, or your town. Keep other items just for you.</Point>
          <Point icon="identity-seal" title="Verified neighbors. More confidence.">Verify your identity to connect across your town. The verified badge helps you know who you’re sharing with.</Point>
          <Point icon="chatbubble" title="Make plans in private">Use a private chat to agree on pickup and share the details.</Point>
        </>}
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <HapticPressable accessibilityRole="button" accessibilityLabel={page === 0 ? 'Continue' : 'Choose your town'} disabled={busy} onPress={next} style={styles.button}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{page === 0 ? 'Continue' : 'Choose your town'}</Text>}
      </HapticPressable>
      {page === 1 && <View style={styles.footer}>
        <HapticPressable accessibilityRole="button" onPress={() => { setPage(0); setError(''); }} disabled={busy} style={styles.linkButton}><Text style={styles.link}>Back</Text></HapticPressable>
        <HapticPressable accessibilityRole="link" onPress={() => Linking.openURL(`${BASE_URL}/privacy`).catch(() => setError('Could not open the Privacy Policy. Please try again.'))} style={styles.linkButton}><Text style={styles.link}>Privacy Policy</Text></HapticPressable>
      </View>}
      <Text style={styles.note}>Get started now. Verify your identity later.</Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: COLORS.background, paddingHorizontal: 24, alignItems: 'center', gap: 16 },
  hero: { width: '100%', alignItems: 'center', gap: 8 },
  // Trim the illustration's transparent margins while keeping its drawing at the same size.
  illustrationFrame: { width: 190, height: 88, overflow: 'hidden' },
  illustration: { transform: [{ translateY: -14 }] },
  step: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 1.5, color: COLORS.textSecondary },
  title: { ...TYPOGRAPHY.largeTitle, width: '100%', fontSize: 28, lineHeight: 34, fontFamily: 'DMSans_700Bold', fontWeight: '700', color: COLORS.primaryDark, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, color: COLORS.textSecondary, textAlign: 'center' },
  card: { width: '100%', padding: 20, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  pointCopy: { flex: 1 },
  point: { fontSize: 17, lineHeight: 23, fontFamily: 'DMSans_700Bold', fontWeight: '700', color: COLORS.primaryDark },
  detail: { fontSize: 14, lineHeight: 21, color: COLORS.textSecondary, marginTop: 5 },
  button: { width: '100%', minHeight: 52, padding: SPACING.lg, borderRadius: RADIUS.full, alignItems: 'center', backgroundColor: COLORS.primary },
  buttonText: { fontSize: 17, fontWeight: '600', color: 'white' },
  note: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  link: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  error: { color: COLORS.danger, fontSize: 15 },
});
