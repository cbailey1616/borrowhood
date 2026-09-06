import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WoodlandIllustration from '../../components/WoodlandIllustration';
import Icon from '../../components/Icon';
import HapticPressable from '../../components/HapticPressable';
import api from '../../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../utils/config';

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
      <WoodlandIllustration scene="neighborhood" width={240} />
      <Text style={styles.title}>Your things.{'\n'}Your neighborhood.</Text>
      <Text style={styles.body}>Borrow what you need. Choose what you share, and with whom.</Text>
      <View style={styles.card}>
        <View style={styles.pointRow}><Icon name="lock-closed" size={24} illustrated /><Text style={styles.point}>Choose who sees each item</Text></View>
        <View style={styles.pointRow}><Icon name="home" size={24} illustrated /><Text style={styles.point}>Find what you need nearby</Text></View>
        <View style={styles.pointRow}><Icon name="chatbubble" size={24} illustrated /><Text style={styles.point}>Arrange the details in chat</Text></View>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <HapticPressable accessibilityRole="button" accessibilityLabel="Choose your town" disabled={busy} onPress={next} style={styles.button}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Choose your town</Text>}
      </HapticPressable>
      <Text style={styles.note}>Get started now. Verify your identity later.</Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: COLORS.background, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', gap: 20 },
  title: { ...TYPOGRAPHY.largeTitle, lineHeight: 39, color: COLORS.text, textAlign: 'center' },
  body: { fontSize: 17, lineHeight: 25, color: COLORS.textSecondary, textAlign: 'center' },
  card: { width: '100%', padding: 20, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  point: { ...TYPOGRAPHY.body, fontWeight: '500', color: COLORS.text, flex: 1 },
  detail: { fontSize: 15, lineHeight: 22, color: COLORS.textSecondary, marginBottom: 16 },
  button: { width: '100%', minHeight: 52, padding: SPACING.lg, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: COLORS.primary },
  buttonText: { fontSize: 17, fontWeight: '600', color: 'white' },
  note: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary, textAlign: 'center' },
  error: { color: COLORS.danger, fontSize: 15 },
});
