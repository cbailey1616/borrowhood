import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, ANIMATION } from '../utils/config';

// Continuous onboarding progress — a thin track with a green gradient fill
// that springs to step/total as the user advances. Replaces per-screen dots
// on the form steps for a cohesive sense of progress.
export default function OnboardingProgressBar({ step, total = 4 }) {
  const pct = Math.max(0, Math.min(1, step / total));
  const w = useSharedValue(pct);

  useEffect(() => {
    w.value = withSpring(pct, ANIMATION.spring.gentle);
  }, [pct]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ now: step, min: 0, max: total }}>
      <Animated.View style={[styles.fillWrap, fillStyle]}>
        <LinearGradient
          colors={[COLORS.primaryLight, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceElevated,
    overflow: 'hidden',
    marginHorizontal: SPACING.lg,
  },
  fillWrap: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
});
