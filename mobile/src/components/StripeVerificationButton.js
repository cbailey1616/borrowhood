import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import HapticPressable from './HapticPressable';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function StripeVerificationButton({ onPress, loading = false, testID }) {
  const { fontScale = 1 } = useWindowDimensions();
  const logoWidth = 57 * Math.min(fontScale, 1.6);
  return (
    <HapticPressable
      onPress={onPress}
      disabled={loading}
      haptic="medium"
      testID={testID}
      accessibilityLabel="Verify through Stripe"
      accessibilityState={{ disabled: loading, busy: loading }}
      style={styles.button}
    >
      {loading ? <ActivityIndicator color={COLORS.surface} /> : (
        <View style={styles.label}>
          <Text style={styles.text}>Verify through</Text>
          <View style={styles.brand}>
            <Image source={require('../../assets/brand/stripe-wordmark-purple.svg')}
              style={{ width: logoWidth, height: logoWidth * 150 / 360 }} contentFit="contain" accessible={false} />
          </View>
        </View>
      )}
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, paddingVertical: 10, paddingHorizontal: 20, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  label: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 9, rowGap: 4 },
  text: { ...TYPOGRAPHY.button, color: COLORS.surface },
  brand: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.xs, backgroundColor: COLORS.surface },
});
