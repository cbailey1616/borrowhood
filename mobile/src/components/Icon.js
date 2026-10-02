import { COLORS } from '../utils/config';
import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { hasBorrowhoodIcon, iconSvg } from '../assets/borrowhood-icons';

// Functional icons use the original line drawings. Artwork opts in explicitly.
export function usesWarmIllustration() { return false; }

// Keep the existing API so every screen gets the same Borrowhood drawings.
// SVG decoding is already included in expo-image in the development build.
const FriendlyIcon = memo(function FriendlyIcon({
  name = 'pricetag', size = 24, color, fillColor, style, illustrated,
  selected = false, accessibilityLabel, ...props
}) {
  const ink = color || StyleSheet.flatten(style)?.color || COLORS.primary;
  const warm = illustrated === true;
  const source = useMemo(() => ({
    uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(name, { color: ink, fillColor, illustrated: warm, selected }))}`,
  }), [name, ink, fillColor, warm, selected]);

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
