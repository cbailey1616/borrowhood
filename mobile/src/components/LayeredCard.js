import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../utils/config';

// Wrap an opaque, rounded card with a quiet backing layer. Keep spacing on
// this wrapper and clipping on the front card so the backing stays visible.
// No entrance animation: cached photos should stay visible during refreshes.
export default function LayeredCard({ children, style, radius = RADIUS.lg, backingColor = COLORS.surfaceElevated, stacked = true }) {
  return (
    <View style={[styles.container, !stacked && styles.quiet, { borderRadius: radius }, style]}>
      {stacked && <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.backing, { borderRadius: radius, backgroundColor: backingColor }]}
      />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: COLORS.card,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  backing: { position: 'absolute', top: 12, bottom: -6, left: 8, right: 8 },
  quiet: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.035, shadowRadius: 4, elevation: 1 },
});
