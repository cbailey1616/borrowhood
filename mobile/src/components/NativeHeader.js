import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

const LARGE_TITLE_HEIGHT = 42;
const LARGE_TITLE_THRESHOLD = 80;

export default function NativeHeader({
  title,
  scrollY,
  rightElement,
  leftElement,
  children,
}) {
  const insets = useSafeAreaInsets();

  // Large title: fades + slides up + collapses height
  const largeTitleStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 1, transform: [{ translateY: 0 }], maxHeight: LARGE_TITLE_HEIGHT + 100 };
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
      maxHeight: interpolate(
        scrollY.value,
        [0, LARGE_TITLE_THRESHOLD],
        [LARGE_TITLE_HEIGHT + 100, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  // Collapsed bar: fades in when scrolled
  const smallTitleStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 0 };
    return {
      opacity: interpolate(
        scrollY.value,
        [LARGE_TITLE_THRESHOLD - 20, LARGE_TITLE_THRESHOLD],
        [0, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  const blurOpacity = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 0 };
    return {
      opacity: interpolate(
        scrollY.value,
        [0, LARGE_TITLE_THRESHOLD],
        [0, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  return (
    <View>
      {/* Fixed collapsed header bar — no touch blocking */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[styles.blurBg, blurOpacity]} pointerEvents="none">
          {Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="default" style={StyleSheet.absoluteFill}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.materials.thick }]} />
            </BlurView>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]} />
          )}
        </Animated.View>
        <Animated.View style={[styles.headerContent, smallTitleStyle]} pointerEvents="none">
          <View style={styles.headerLeft}>{leftElement || null}</View>
          <Text style={styles.smallTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.headerRight} />
        </Animated.View>
        <Animated.View style={[styles.headerSeparator, blurOpacity]} pointerEvents="none" />
      </View>

      {/* Right element — always visible, always tappable */}
      {rightElement && (
        <View style={[styles.rightElementFixed, { top: insets.top + 6 }]}>
          {rightElement}
        </View>
      )}

      {/* Large title — collapses on scroll */}
      <Animated.View style={[styles.largeTitleContainer, { marginTop: insets.top + 4 }, largeTitleStyle]}>
        <Text style={styles.largeTitle}>{title}</Text>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  blurBg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    paddingHorizontal: SPACING.lg,
  },
  headerLeft: {
    minWidth: 40,
    alignItems: 'flex-start',
  },
  headerRight: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  smallTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
    flex: 1,
    textAlign: 'center',
  },
  headerSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
  },
  rightElementFixed: {
    position: 'absolute',
    right: SPACING.lg,
    zIndex: 20,
  },
  largeTitleContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 0,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.borderGreen,
    overflow: 'hidden',
  },
  largeTitle: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.primary,
  },
});
