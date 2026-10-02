import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import useReduceMotion from '../hooks/useReduceMotion';

// Staggered mount entrance — items fade + rise into place as they appear.
// Delay is capped so far-down rows don't wait an eternity, and so recycled
// FlatList rows re-enter quickly while scrolling.
export default function AnimatedCard({
  index = 0,
  delay = 45,
  style,
  children,
}) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) { cancelAnimation(progress); progress.value = 1; return; }
    const staggered = Math.min(index, 8) * delay;
    progress.value = withDelay(
      staggered,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
    );
    return () => cancelAnimation(progress);
  }, [reduceMotion, index, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
