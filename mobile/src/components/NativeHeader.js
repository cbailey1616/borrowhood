import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
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
}) {
  const insets = useSafeAreaInsets();
  const topInset = includeTopInset ? insets.top : 0;

  const largeTitleStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 1, transform: [{ translateY: 0 }] };
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
    if (!scrollY) return {};
    return {
      maxHeight: interpolate(
        scrollY.value,
        [0, LARGE_TITLE_THRESHOLD],
        [LARGE_TITLE_HEIGHT + topInset + SPACING.lg, topInset + 4],
        Extrapolation.CLAMP
      ),
    };
  });

  return (
    <View>
      <Animated.View style={[styles.headerWrapper, { paddingTop: topInset + 4, paddingBottom: SPACING.lg, overflow: 'hidden' }, style, wrapperStyle]}>
        {backdrop}
        <Animated.View style={largeTitleStyle}>
          {(title || leftElement || rightElement) && (
            <View style={[styles.titleRow, titleRowStyle]}>
              <View style={styles.titleGroup}>
                {leftElement}
                {title ? <Text accessibilityRole="header" style={[styles.largeTitle, titleStyle]}>{title}</Text> : null}
              </View>
              {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
            </View>
          )}
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.xl,
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
