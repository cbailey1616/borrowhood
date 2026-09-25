import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, RADIUS, CARD_SURFACE } from '../utils/config';

// A single rounded surface with a subtle shadow. Keep spacing on this wrapper
// and clipping on the inner card so photos retain their rounded corners.
// No entrance animation: cached photos should stay visible during refreshes.
export default function LayeredCard({ children, style, radius = RADIUS.lg, accent = false, ...props }) {
  return (
    <View {...props} style={[styles.container, { borderRadius: radius }, style]}>
      {accent && <View pointerEvents="none" accessible={false} style={[styles.accent, { borderRadius: radius }]} />}
      {accent ? <View style={[styles.face, { borderRadius: radius }]}>{children}</View> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...CARD_SURFACE,
    position: 'relative',
  },
  accent: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.primaryMuted, transform: [{ translateX: 5 }, { translateY: 6 }] },
  face: { backgroundColor: COLORS.card },
});
