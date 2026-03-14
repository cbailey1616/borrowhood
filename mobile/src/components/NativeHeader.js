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
  scrollY,
  rightElement,
  leftElement,
  children,
}) {
  const insets = useSafeAreaInsets();

  // Large title: fades + slides up
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

  // Collapse wrapper using maxHeight only (single layout property for smoother scrolling)
  const wrapperStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    return {
      maxHeight: interpolate(
        scrollY.value,
        [0, LARGE_TITLE_THRESHOLD],
        [LARGE_TITLE_HEIGHT + insets.top + SPACING.lg, insets.top + 4],
        Extrapolation.CLAMP
      ),
    };
  });

  return (
    <View>
      <Animated.View style={[styles.greenWrapper, { paddingTop: insets.top + 4, paddingBottom: SPACING.lg, overflow: 'hidden' }, wrapperStyle]}>
        <Animated.View style={largeTitleStyle}>
          {(title || rightElement) && (
            <View style={styles.titleRow}>
              {title ? <Text style={styles.largeTitle}>{title}</Text> : <View />}
              {rightElement && <View>{rightElement}</View>}
            </View>
          )}
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  greenWrapper: {
    backgroundColor: COLORS.greenBg,
    paddingHorizontal: SPACING.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  largeTitle: {
    ...TYPOGRAPHY.largeTitle,
    color: '#fff',
  },
});
