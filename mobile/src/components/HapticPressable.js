import React, { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { haptics } from '../utils/haptics';
import { ANIMATION } from '../utils/config';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HapticPressable({
  onPress,
  onLongPress,
  haptic = 'light',
  scaleDown = 0.97,
  disabled,
  style,
  children,
  ...rest
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(scaleDown, ANIMATION.spring.stiff);
  }, [scaleDown]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, ANIMATION.spring.default);
  }, []);

  const handlePress = useCallback(
    (e) => {
      if (haptic && haptics[haptic]) {
        haptics[haptic]();
      }
      onPress?.(e);
    },
    [haptic, onPress]
  );

  const handleLongPress = useCallback(
    (e) => {
      if (onLongPress) {
        haptics.medium();
        onLongPress(e);
      }
    },
    [onLongPress]
  );

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[animatedStyle, disabled && styles.disabled, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
});
