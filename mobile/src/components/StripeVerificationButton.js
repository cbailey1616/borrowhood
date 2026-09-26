import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Icon from './Icon';
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
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      style={[styles.button, unavailable && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={COLORS.surface} /> : label === 'Verify through Stripe' ? (
        <>
          <View style={styles.brandLabel} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.text}>Verify through</Text>
            <View style={styles.logoBadge}>
              <Image source={require('../../assets/brand/stripe-wordmark-purple.svg')} style={styles.logo} contentFit="contain" transition={0} />
            </View>
          </View>
          <Icon name="arrow-forward" size={20} color={COLORS.surface} />
        </>
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, paddingVertical: 10, paddingHorizontal: 20, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.primary, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  brandLabel: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  logoBadge: { paddingHorizontal: 7, paddingVertical: 4, backgroundColor: '#FFFFFF', borderRadius: 8 },
  logo: { width: 59, height: 25 },
  text: { ...TYPOGRAPHY.button, color: COLORS.surface, textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.6 },
});
