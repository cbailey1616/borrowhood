import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, cancelAnimation } from 'react-native-reanimated';
import { haptics } from '../utils/haptics';
import { ANIMATION } from '../utils/config';
import useReduceMotion from '../hooks/useReduceMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HapticPressable({
  onPress, onLongPress, onPressIn, onPressOut,
  haptic = null, longPressHaptic = null, scaleDown = 1,
  pressedBackgroundColor, disabled, style, children, ...rest
}) {
  const reduceMotion = useReduceMotion();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || scaleDown === 1) {
      cancelAnimation(scale);
      scale.value = 1;
    }
  }, [reduceMotion, scaleDown]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePressIn = useCallback(event => {
    setPressed(true);
    if (!reduceMotion && scaleDown !== 1) scale.value = withSpring(scaleDown, ANIMATION.spring.stiff);
    onPressIn?.(event);
  }, [reduceMotion, scaleDown, onPressIn]);
  const handlePressOut = useCallback(event => {
    setPressed(false);
    if (!reduceMotion && scaleDown !== 1) scale.value = withSpring(1, ANIMATION.spring.default);
    onPressOut?.(event);
  }, [reduceMotion, scaleDown, onPressOut]);
  const handlePress = useCallback(event => {
    if (haptic && haptics[haptic]) haptics[haptic]();
    onPress?.(event);
  }, [haptic, onPress]);
  const handleLongPress = useCallback(event => {
    if (longPressHaptic && haptics[longPressHaptic]) haptics[longPressHaptic]();
    onLongPress?.(event);
  }, [longPressHaptic, onLongPress]);
  return <AnimatedPressable
    accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
    onPress={handlePress} onLongPress={onLongPress ? handleLongPress : undefined}
    onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={disabled}
    style={[animatedStyle, disabled && styles.disabled, typeof style === 'function' ? style({ pressed }) : style,
      pressed && !disabled && pressedBackgroundColor && { backgroundColor: pressedBackgroundColor }]}
    {...rest}>{children}</AnimatedPressable>;
}
const styles = StyleSheet.create({ disabled: { opacity: 0.5 } });
