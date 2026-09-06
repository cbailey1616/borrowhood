import React from 'react';
import { View } from 'react-native';
import { FriendlyIcon } from './Icon';
import { COLORS } from '../utils/config';

export default function CategoryIcon({ icon, size = 40, radius }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: radius ?? size * 0.25,
      backgroundColor: COLORS.surfaceElevated,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <FriendlyIcon name={String(icon).startsWith('sparkles') ? 'brush' : icon} size={size * 0.6} illustrated />
    </View>
  );
}
