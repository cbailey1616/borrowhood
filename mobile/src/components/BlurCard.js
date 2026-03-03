import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, RADIUS } from '../utils/config';

export default function BlurCard({
  intensity = 40,
  tint = 'default',
  style,
  children,
  fallbackColor = COLORS.background,
  innerColor,
  testID,
  accessibilityLabel,
}) {
  if (Platform.OS === 'android') {
    return (
      <View style={[styles.card, { backgroundColor: fallbackColor }, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint={tint}
      style={[styles.card, style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.inner, { backgroundColor: innerColor || COLORS.materials.thick }]}>
        {children}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  inner: {
  },
});
