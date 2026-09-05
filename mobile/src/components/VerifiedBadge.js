import React from 'react';
import { View } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS } from '../utils/config';

// A compact, legible identity mark at every size. No decorative glow.
export default function VerifiedBadge({ size = 18 }) {
  return (
    <View accessible accessibilityLabel="Verified identity" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="checkmark-circle" size={size} color={COLORS.primary} />
    </View>
  );
}
