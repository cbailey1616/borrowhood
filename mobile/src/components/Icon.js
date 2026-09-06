import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { hasBorrowhoodIcon, iconSvg, resolveIconName } from '../assets/borrowhood-icons';

// Navigation and status marks stay clear; objects get our warm illustrated fills.
const CONTROL_ICONS = /^(close|add|remove|checkmark|chevron|arrow|ellipsis|search|send|eye|ellipse|alert|information|help)/;
export function usesWarmIllustration(name, color = '#42594C') {
  const ink = String(color).toLowerCase();
  return ['#42594c', '#32483c', '#688566', '#343e35', '#5d6659', '#636c5b'].includes(ink)
    && !CONTROL_ICONS.test(resolveIconName(name));
}

// Keep the existing API so every screen gets the same Borrowhood drawings.
// SVG decoding is already included in expo-image in the development build.
const FriendlyIcon = memo(function FriendlyIcon({
  name = 'pricetag', size = 24, color, style, illustrated,
  selected = !String(name).endsWith('-outline'), accessibilityLabel, ...props
}) {
  const ink = color || StyleSheet.flatten(style)?.color || '#42594C';
  const warm = illustrated ?? usesWarmIllustration(name, ink);
  const source = useMemo(() => ({
    uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(name, { color: ink, illustrated: warm, selected }))}`,
  }), [name, ink, warm, selected]);

  return (
    <Image
      source={source}
      style={[{ width: size, height: size, flexShrink: 0 }, style]}
      contentFit="contain"
      transition={0}
      cachePolicy="memory"
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      {...props}
    />
  );
});

export function outlineIcon(name = 'pricetag') {
  return `${hasBorrowhoodIcon(name) ? String(name).replace(/-(outline|sharp)$/, '') : 'pricetag'}-outline`;
}

export { FriendlyIcon, FriendlyIcon as Ionicons };
export default FriendlyIcon;
