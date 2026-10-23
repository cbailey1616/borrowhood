import { useReservedSideInsets, useTopReservedSpace } from '../context/ReservedRegionsContext';
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useContentInsets as useSafeAreaInsets } from '../context/MainViewportContext';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import useReduceMotion from '../hooks/useReduceMotion';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

const LARGE_TITLE_HEIGHT = 200;
const LARGE_TITLE_THRESHOLD = 80;

export default function NativeHeader({
  title,
  titleStyle,
  titleRowStyle,
  scrollY,
  rightElement,
  leftElement,
  style,
  children,
  backdrop,
  includeTopInset = true,
  includeSideInsets = true,
}) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const reservedBottom = useTopReservedSpace();
  const topInset = includeTopInset ? insets.top : 0;
  // The bold title overlaps the scene's lower edge; smaller tabs stay below it.
  // Only the row crossing system UI needs horizontal clearance.
  // Fill the space already reserved for the corner status UI instead of
  // leaving a blank band between the landscape and the page content.
  const artworkHeight = backdrop ? Math.max(topInset + 112, reservedBottom - SPACING.sm) : 0;
  const contentOrigin = backdrop ? topInset + SPACING.xl : 0;
  const artworkOverlap = artworkHeight - contentOrigin;
  const contentTop = StyleSheet.flatten(style)?.paddingTop ?? (backdrop ? SPACING.md : topInset + SPACING.md);
  const [titleFrame, setTitleFrame] = useState(null);
  const titleTop = contentOrigin + (titleFrame?.y ?? contentTop);
  const reservedSides = useReservedSideInsets(titleTop, titleTop + (titleFrame?.height ?? 44));
  const sideInsets = includeSideInsets
    ? { marginLeft: Math.max(insets.left, reservedSides.left), marginRight: Math.max(insets.right, reservedSides.right) }
    : undefined;
  const titleMarginBottom = StyleSheet.flatten([styles.titleRow, titleRowStyle]).marginBottom ?? 0;
  const controlsClearance = backdrop
    ? Math.max(0, Math.max(reservedBottom, artworkHeight) - contentOrigin - (titleFrame ? titleFrame.y + titleFrame.height : contentTop + 44) - titleMarginBottom)
    : 0;
  const onTitleLayout = ({ nativeEvent: { layout } }) => setTitleFrame(previous =>
    previous?.y === layout.y && previous?.height === layout.height ? previous : { y: layout.y, height: layout.height });

  const largeTitleStyle = useAnimatedStyle(() => {
    if (reduceMotion || !scrollY) return { opacity: 1, transform: [{ translateY: 0 }] };
    return {
      opacity: interpolate(
        scrollY.value,
        [0, LARGE_TITLE_THRESHOLD * 0.6],
        [1, 0],
        Extrapolation.CLAMP
      ),
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [0, LARGE_TITLE_THRESHOLD],
            [0, -20],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  const wrapperStyle = useAnimatedStyle(() => {
    if (reduceMotion || !scrollY) return {};
    return {
      maxHeight: interpolate(
        scrollY.value,
        [0, LARGE_TITLE_THRESHOLD],
        [LARGE_TITLE_HEIGHT + topInset + artworkHeight + SPACING.lg, artworkHeight + topInset + 4],
        Extrapolation.CLAMP
      ),
    };
  });

  return (
    <Animated.View style={[styles.headerWrapper, backdrop && { minHeight: Math.max(artworkHeight, reservedBottom) }, wrapperStyle]}>
      {backdrop && <View testID="Header.artworkBand" pointerEvents="none" accessible={false}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ height: artworkHeight, overflow: 'hidden' }}>
        {backdrop}
      </View>}
      <Animated.View testID="Header.content" style={[
        styles.content,
        { paddingTop: backdrop ? SPACING.md : topInset + SPACING.md, marginTop: -artworkOverlap,
          minHeight: backdrop ? undefined : reservedBottom },
        style, largeTitleStyle,
      ]}>
        {(title || leftElement || rightElement) && (
          <View testID="Header.titleRow" onLayout={onTitleLayout} style={[styles.titleRow, sideInsets, titleRowStyle]}>
            <View style={styles.titleGroup}>
              {leftElement}
              {title ? <Text accessibilityRole="header" style={[styles.largeTitle, titleStyle]}>{title}</Text> : null}
            </View>
            {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
          </View>
        )}
        {children && <View testID="Header.controls" style={backdrop ? { marginTop: controlsClearance } : sideInsets}>{children}</View>}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  content: {
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  titleGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rightElement: { flexShrink: 0, marginLeft: SPACING.sm },
  largeTitle: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.text,
    flexShrink: 1,
  },
});
