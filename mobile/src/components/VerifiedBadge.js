import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import HapticPressable from './HapticPressable';
import PopupLayer from './PopupLayer';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function VerifiedBadge({ size = 18, interactive = false }) {
  if (interactive) return <IdentityInfoBadge size={size} />;
  return <View accessible accessibilityLabel="Verified identity" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name="identity-seal" size={size} color={COLORS.primary} />
  </View>;
}
function IdentityInfoBadge({ size }) {
  const [visible, setVisible] = useState(false);
  const close = () => setVisible(false);
  return <>
    <HapticPressable accessibilityRole="button" accessibilityLabel="Verified identity" accessibilityHint="Learn about identity verification" hitSlop={8}
      onPress={event => { event?.stopPropagation?.(); setVisible(true); }}
      style={{ width: size + 4, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="identity-seal" size={size} color={COLORS.primary} />
    </HapticPressable>
    {visible && <PopupLayer visible onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView bounces={false} contentContainerStyle={styles.content}>
            <Ionicons name="identity-seal" size={58} color={COLORS.primary} />
            <Text accessibilityRole="header" style={styles.title}>Identity verified</Text>
            <Text style={styles.body}>This person verified their identity through Stripe.</Text>
            <HapticPressable accessibilityRole="button" onPress={close} style={styles.button}><Text style={styles.buttonText}>Got it</Text></HapticPressable>
          </ScrollView>
        </View>
      </View>
    </PopupLayer>}
  </>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.overlay },
  card: { width: '100%', maxWidth: 400, maxHeight: '85%', backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, overflow: 'hidden' },
  content: { alignItems: 'center', padding: 24, gap: 16 },
  title: { ...TYPOGRAPHY.title2, color: COLORS.text, textAlign: 'center' },
  body: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center' },
  button: { alignSelf: 'stretch', backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, minHeight: 48, justifyContent: 'center', padding: 12 },
  buttonText: { ...TYPOGRAPHY.button, textAlign: 'center', color: COLORS.surface },
});
