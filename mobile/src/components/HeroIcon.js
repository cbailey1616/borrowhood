import React from 'react';
import { View } from 'react-native';
import { Ionicons, outlineIcon } from './Icon';
import { COLORS, SHADOWS } from '../utils/config';

// Two quiet surfaces give empty states depth without glossy emblems.
export default function HeroIcon({ icon = 'swap-horizontal', size = 84 }) {
  return (
    <View style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size * 0.27, backgroundColor: COLORS.primaryMuted, transform: [{ translateY: 5 }, { translateX: -4 }] }} />
      <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center', ...SHADOWS.md }}>
        <Ionicons name={outlineIcon(icon)} size={size * 0.44} color={COLORS.primary} />
      </View>
    </View>
  );
}
