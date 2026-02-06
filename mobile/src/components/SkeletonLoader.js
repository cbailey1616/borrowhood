import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS, SPACING, RADIUS } from '../utils/config';

function SkeletonShape({ width, height, borderRadius = RADIUS.sm, style }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: COLORS.surfaceElevated,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// Preset: Card skeleton
export function SkeletonCard({ style }) {
  return (
    <View style={[styles.card, style]}>
      <SkeletonShape width="100%" height={160} borderRadius={RADIUS.lg} />
      <View style={styles.cardContent}>
        <SkeletonShape width="70%" height={16} style={styles.spaceSm} />
        <SkeletonShape width="40%" height={14} style={styles.spaceSm} />
        <SkeletonShape width="30%" height={14} />
      </View>
    </View>
  );
}

// Preset: List item skeleton
export function SkeletonListItem({ style }) {
  return (
    <View style={[styles.listItem, style]}>
      <SkeletonShape width={48} height={48} borderRadius={RADIUS.full} />
      <View style={styles.listContent}>
        <SkeletonShape width="60%" height={14} style={styles.spaceSm} />
        <SkeletonShape width="80%" height={12} />
      </View>
    </View>
  );
}

// Preset: Profile skeleton
export function SkeletonProfile({ style }) {
  return (
    <View style={[styles.profile, style]}>
      <SkeletonShape width={88} height={88} borderRadius={RADIUS.full} />
      <SkeletonShape width={140} height={18} style={[styles.spaceMd, { alignSelf: 'center' }]} />
      <SkeletonShape width={200} height={14} style={[styles.spaceSm, { alignSelf: 'center' }]} />
    </View>
  );
}

export default SkeletonShape;

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.lg,
  },
  cardContent: {
    paddingTop: SPACING.md,
  },
  spaceSm: {
    marginBottom: SPACING.sm,
  },
  spaceMd: {
    marginTop: SPACING.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  listContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  profile: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
});
