import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, RADIUS } from '../utils/config';

export default function BlurCard({
  intensity = 40,
  tint = 'dark',
  style,
  children,
  fallbackColor = COLORS.surface,
  innerColor,
}) {
  if (Platform.OS === 'android') {
    return (
      <View style={[styles.card, { backgroundColor: fallbackColor }, style]}>
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint={tint}
      style={[styles.card, style]}
    >
      <View style={[styles.inner, { backgroundColor: innerColor || COLORS.materials.thin }]}>
        {children}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
  },
});
