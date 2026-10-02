import { COLORS } from '../utils/config';
import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { hasBorrowhoodIcon, iconSvg, resolveIconName } from '../assets/borrowhood-icons';

// Feature and object drawings keep their original woodland palette. Small
// controls and icons on colored buttons retain the requested foreground ink.
const CONTROL_ICONS = /^(close|add|remove|checkmark|selection-check|chevron|arrow|ellipsis|search|send|eye|ellipse|alert|information|help|filter|refresh|pencil|trash|scan|qr-code|happy|reaction-add)/;
const WOODLAND_INKS = new Set([
  COLORS.primary, COLORS.primaryDark, COLORS.primaryLight,
  COLORS.text, COLORS.textSecondary, COLORS.textMuted,
].map(color => color.toLowerCase()));

export function usesWarmIllustration(name, color = COLORS.primary) {
  return WOODLAND_INKS.has(String(color).toLowerCase())
    && !CONTROL_ICONS.test(resolveIconName(name));
}

// Keep the existing API so every screen gets the same Borrowhood drawings.
// SVG decoding is already included in expo-image in the development build.
const FriendlyIcon = memo(function FriendlyIcon({
  name = 'pricetag', size = 24, color, fillColor, style, illustrated,
  selected = /^(heart|bookmark|star)$/.test(String(name)), accessibilityLabel, ...props
}) {
  const ink = color || StyleSheet.flatten(style)?.color || COLORS.primary;
  const warm = illustrated ?? usesWarmIllustration(name, ink);
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
