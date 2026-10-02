import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RADIUS, CARD_SURFACE } from '../utils/config';

// A single rounded surface with a subtle shadow. Keep spacing on this wrapper
// and clipping on the inner card so photos retain their rounded corners.
// The legacy accent prop is accepted without creating an offset layer.
// No entrance animation: cached photos should stay visible during refreshes.
export default function LayeredCard({ children, style, radius = RADIUS.lg, accent = false, ...props }) {
  return (
    <View {...props} style={[styles.container, { borderRadius: radius }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...CARD_SURFACE,
    position: 'relative',
  },
});
