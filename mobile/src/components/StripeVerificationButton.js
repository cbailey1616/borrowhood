import React from 'react';
import { Text, ActivityIndicator, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

// Stripe provides the identity check, not the payment for verification.
export default function StripeVerificationButton({ onPress, loading = false, disabled = false, label = 'Verify now', testID }) {
  const unavailable = loading || disabled;
  return (
    <HapticPressable
      onPress={onPress}
      disabled={unavailable}
      haptic="medium"
      testID={testID}
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      style={[styles.button, unavailable && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={COLORS.surface} /> : (
        <Text style={styles.text}>{label}</Text>
      )}
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, paddingVertical: 10, paddingHorizontal: 20, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  text: { ...TYPOGRAPHY.button, color: COLORS.surface, textAlign: 'center' },
  disabled: { opacity: 0.6 },
});
