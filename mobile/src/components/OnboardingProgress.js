import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { COLORS, SPACING, ANIMATION } from '../utils/config';

const TOTAL_STEPS = 5;
const DOT_SIZE = 8;
const ACTIVE_WIDTH = 24;

export default function OnboardingProgress({ currentStep }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <Dot key={i} index={i + 1} currentStep={currentStep} />
      ))}
    </View>
  );
}

function Dot({ index, currentStep }) {
  const width = useSharedValue(index === currentStep ? ACTIVE_WIDTH : DOT_SIZE);

  useEffect(() => {
    width.value = withSpring(
      index === currentStep ? ACTIVE_WIDTH : DOT_SIZE,
      ANIMATION.spring.default
    );
  }, [currentStep]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    backgroundColor:
      index <= currentStep ? COLORS.primary : COLORS.gray[700],
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
