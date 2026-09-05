import React from 'react';
import { View } from 'react-native';
import { Ionicons, outlineIcon } from './Icon';
import { COLORS } from '../utils/config';

export default function CategoryIcon({ icon, size = 40, radius }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: radius ?? size * 0.25,
      backgroundColor: COLORS.primaryMuted,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name={outlineIcon(icon)} size={size * 0.5} color={COLORS.primary} />
    </View>
  );
}
