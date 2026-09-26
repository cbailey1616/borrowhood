import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from './HapticPressable';
import PopupLayer from './PopupLayer';
import SheetDismissArea from './SheetDismissArea';
import VerificationComparison from './VerificationComparison';
import Icon from './Icon';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function VerificationBenefits() {
  const [visible, setVisible] = useState(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const close = () => setVisible(false);
  return <>
    <View style={styles.card}>
      <View style={styles.row}><View style={[styles.icon, { backgroundColor: COLORS.primaryMuted }]}><Icon name="identity-seal" size={34} color={COLORS.primary} /></View>
        <View style={styles.copy}><Text style={styles.title}>A verified badge</Text><Text style={styles.detail}>Identity checked through Stripe.</Text></View></View>
      <View style={[styles.row, styles.divider]}><View style={[styles.icon, { backgroundColor: COLORS.accentMuted }]}><Icon name="home" size={34} illustrated /></View>
        <View style={styles.copy}><Text style={styles.title}>Town borrowing</Text><Text style={styles.detail}>See who’s lending in Town.</Text></View></View>
    </View>
    <HapticPressable accessibilityRole="button" accessibilityHint="Opens a comparison of available features"
      onPress={() => setVisible(true)} style={styles.linkButton}>
      <Text style={styles.link}>What does verification unlock?</Text>
    </HapticPressable>
    <Text style={styles.requirement}>You’ll need a photo ID and a selfie.</Text>
    {visible && <PopupLayer visible onRequestClose={close}>
      <View style={styles.overlay} onAccessibilityEscape={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} />
        <View style={[styles.sheet, { maxHeight: height - insets.top - 20, paddingBottom: Math.max(insets.bottom, 20) }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <SheetDismissArea onDismiss={close}>
              <View style={styles.header}><Text accessibilityRole="header" style={styles.sheetTitle}>What does verification unlock?</Text>
                <HapticPressable accessibilityRole="button" accessibilityLabel="Close comparison" onPress={close} style={styles.close}>
                  <Icon name="close" size={22} color={COLORS.primary} /></HapticPressable></View>
            </SheetDismissArea>
            <VerificationComparison />
            <HapticPressable accessibilityRole="button" onPress={close} style={styles.done}><Text style={styles.doneText}>Done</Text></HapticPressable>
          </ScrollView>
        </View>
      </View>
    </PopupLayer>}
  </>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, paddingHorizontal: 18, borderWidth: 1, borderColor: COLORS.borderLight },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  icon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  copy: { flex: 1, gap: 5 },
  title: { ...TYPOGRAPHY.headline, color: COLORS.text },
  detail: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  linkButton: { minHeight: 48, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  link: { ...TYPOGRAPHY.footnote, color: COLORS.primary, textDecorationLine: 'underline', textAlign: 'center' },
  requirement: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginTop: 2 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
  content: { padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  sheetTitle: { ...TYPOGRAPHY.title2, color: COLORS.primary, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  done: { minHeight: 52, padding: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, marginTop: 20, justifyContent: 'center' },
  doneText: { ...TYPOGRAPHY.button, textAlign: 'center', color: COLORS.surface },
});
