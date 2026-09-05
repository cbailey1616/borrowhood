import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeroIcon from '../../components/HeroIcon';
import HapticPressable from '../../components/HapticPressable';
import api from '../../services/api';
import { COLORS, SPACING, RADIUS } from '../../utils/config';

export default function OnboardingIntroScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api.updateOnboardingStep(2);
      navigation.navigate('OnboardingNeighborhood');
    } catch { setError('Could not save your progress. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <HeroIcon icon="swap-horizontal" size={88} />
      <Text style={styles.title}>Good neighbors.{'\n'}Useful things.</Text>
      <Text style={styles.body}>Borrow what you need. Share what you have. All for free.</Text>
      <View style={styles.card}>
        <Text style={styles.point}>Find items nearby</Text>
        <Text style={styles.detail}>Choose your town and see what neighbors are sharing.</Text>
        <Text style={styles.point}>Agree on pickup and return</Text>
        <Text style={styles.detail}>Message each other and keep track in the app.</Text>
        <Text style={styles.point}>Build trust with every exchange</Text>
        <Text style={styles.detail}>Reviews and completed exchanges help you decide who to share with.</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <HapticPressable accessibilityRole="button" accessibilityLabel="Choose your town" disabled={busy} onPress={next} style={styles.button}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Choose your town</Text>}
      </HapticPressable>
      <Text style={styles.note}>No payment setup. Identity verification is optional.</Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: COLORS.background, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', gap: 20 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1, color: COLORS.text, textAlign: 'center' },
  body: { fontSize: 17, lineHeight: 25, color: COLORS.textSecondary, textAlign: 'center' },
  card: { width: '100%', padding: 20, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight },
  point: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 5 },
  detail: { fontSize: 15, lineHeight: 22, color: COLORS.textSecondary, marginBottom: 16 },
  button: { width: '100%', minHeight: 52, padding: SPACING.lg, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: COLORS.primary },
  buttonText: { fontSize: 17, fontWeight: '600', color: 'white' },
  note: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary, textAlign: 'center' },
  error: { color: COLORS.danger, fontSize: 15 },
});
