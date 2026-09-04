import React from 'react';
import { View } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS } from '../utils/config';

export default function CategoryIcon({ icon, size = 40, radius }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: radius ?? size * 0.3,
      backgroundColor: COLORS.primaryMuted,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name={icon || 'pricetag-outline'} size={size * 0.5} color={COLORS.primary} />
    </View>
  );
}
