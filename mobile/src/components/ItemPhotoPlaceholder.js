import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { iconSvg } from '../assets/borrowhood-icons';
import { projectItemSvg } from '../assets/project-item-scenes';
import { CATEGORY_ICONS, COLORS } from '../utils/config';

const CATEGORY_TONES = {
  'tools-hardware': COLORS.primaryMuted,
  'kitchen-cooking': COLORS.accentMuted,
  'garden-outdoor': COLORS.primaryMuted,
  'sports-recreation': COLORS.infoMuted,
  'electronics-tech': COLORS.infoMuted,
  'party-events': COLORS.warningMuted,
  'kids-baby': COLORS.accentMuted,
  'camping-travel': COLORS.primaryMuted,
  cleaning: COLORS.infoMuted,
};

// A local drawing fills the existing photo frame without making a network request.
// Known items use our original checklist illustrations; other items use their
// category drawing with a quiet woodland ground rather than a generic box.
export default function ItemPhotoPlaceholder({
  category, title, icon, width, height, style, testID,
  accessibilityLabel = 'Item photo unavailable',
}) {
  const slug = typeof category === 'string' ? category : category?.slug;
  const categoryIcon = category?.icon || CATEGORY_ICONS[slug];
  const drawingIcon = categoryIcon || (icon && !/^(cube|box|basket|image|pricetag)/.test(icon) ? icon : 'leaf-outline');
  const source = useMemo(() => {
    const drawing = projectItemSvg(title);
    const categoryDrawing = iconSvg(drawingIcon, { color: COLORS.primary, illustrated: true, selected: true });
    const svg = drawing || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="80" rx="34" ry="5" fill="${COLORS.illustration.sage}" opacity="0.45"/><svg x="18" y="12" width="60" height="60" viewBox="0 0 32 32">${categoryDrawing.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg></svg>`;
    return { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
  }, [title, drawingIcon]);
  return <View testID={testID} accessibilityRole="image" accessibilityLabel={accessibilityLabel}
    style={[styles.frame, width != null && { width }, height != null && { height }, style, { backgroundColor: CATEGORY_TONES[slug] || COLORS.primaryMuted }]}>
    <Image source={source} style={styles.drawing} contentFit="contain" transition={0} accessible={false} />
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', minWidth: 0, minHeight: 0 },
  drawing: { width: '72%', height: '72%' },
});
