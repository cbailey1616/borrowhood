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

const LARGE_TITLE_THRESHOLD = 80;

export default function NativeHeader({
  title,
  scrollY,
  rightElement,
  leftElement,
  children,
}) {
  const insets = useSafeAreaInsets();

  const largeTitleStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 1, transform: [{ translateY: 0 }] };
    return {
      opacity: interpolate(
        scrollY.value,
        [0, LARGE_TITLE_THRESHOLD],
        [1, 0],
        Extrapolation.CLAMP
      ),
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [0, LARGE_TITLE_THRESHOLD],
            [0, -10],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

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

  const headerBar = (
    <View style={[styles.headerBar, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.blurBg, blurOpacity]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.materials.thick }]} />
          </BlurView>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]} />
        )}
      </Animated.View>
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>{leftElement || null}</View>
        <Animated.Text style={[styles.smallTitle, smallTitleStyle]} numberOfLines={1}>
          {title}
        </Animated.Text>
        <View style={styles.headerRight}>{rightElement || null}</View>
      </View>
      <Animated.View style={[styles.headerSeparator, blurOpacity]} />
    </View>
  );

  return (
    <View>
      {headerBar}
      <Animated.View style={[styles.largeTitleContainer, largeTitleStyle]}>
        <Text style={styles.largeTitle}>{title}</Text>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    position: 'relative',
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
    height: 44,
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
    color: COLORS.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
  },
  largeTitleContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  largeTitle: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.text,
  },
});
