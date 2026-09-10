import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../utils/config';

// A single rounded surface with a subtle shadow. Keep spacing on this wrapper
// and clipping on the inner card so photos retain their rounded corners.
// No entrance animation: cached photos should stay visible during refreshes.
export default function LayeredCard({ children, style, radius = RADIUS.lg }) {
  return (
    <View style={[styles.container, { borderRadius: radius }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: COLORS.card,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 4,
    elevation: 1,
  },
});
