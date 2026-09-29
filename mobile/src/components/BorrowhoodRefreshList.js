import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { COLORS } from '../utils/config';

const LOGO_SIZE = 44;

export function BorrowhoodRefreshIndicator({ scrollY, refreshing, top = 0 }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      preferenceChanged = true;
      if (active) setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active && !preferenceChanged) setReduceMotion(enabled);
    }).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!refreshing || reduceMotion) {
      bounce.setValue(0);
      return;
    }
    bounce.setValue(1.8);
    const options = { useNativeDriver: true, isInteraction: false };
    const animation = Animated.sequence([
      Animated.spring(bounce, { ...options, toValue: 0, stiffness: 180, damping: 12, mass: 0.8 }),
      Animated.loop(Animated.sequence([
        Animated.timing(bounce, { ...options, toValue: 1, duration: 460, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(bounce, { ...options, toValue: 0, duration: 460, easing: Easing.inOut(Easing.sin) }),
      ])),
    ]);
    animation.start();
    return () => {
      animation.stop();
      bounce.setValue(0);
    };
  }, [bounce, refreshing, reduceMotion]);

  const motion = useMemo(() => ({
    opacity: scrollY.interpolate({ inputRange: [-20, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
    position: scrollY.interpolate({ inputRange: [-200, 0], outputRange: [100, 0], extrapolate: 'clamp' }),
    scaleX: scrollY.interpolate({ inputRange: [-200, -48, 0], outputRange: [0.78, 1, 0.6], extrapolate: 'clamp' }),
    scaleY: scrollY.interpolate({ inputRange: [-200, -48, 0], outputRange: [1.65, 1, 0.6], extrapolate: 'clamp' }),
    bounceX: bounce.interpolate({ inputRange: [0, 1, 1.8], outputRange: [1, 0.94, 0.84], extrapolate: 'clamp' }),
    bounceY: bounce.interpolate({ inputRange: [0, 1, 1.8], outputRange: [1, 1.12, 1.4], extrapolate: 'clamp' }),
    lift: bounce.interpolate({ inputRange: [0, 1, 1.8], outputRange: [0, -3, 0], extrapolate: 'clamp' }),
  }), [bounce, scrollY]);

  return (
    <Animated.View
      testID="BorrowhoodRefresh.indicator"
      pointerEvents="none"
      accessible={refreshing}
      accessibilityRole="progressbar"
      accessibilityLabel="Refreshing"
      accessibilityState={{ busy: refreshing }}
      accessibilityElementsHidden={!refreshing}
      importantForAccessibility={refreshing ? 'yes' : 'no-hide-descendants'}
      style={[styles.indicator, {
        top: top - LOGO_SIZE / 2,
        opacity: motion.opacity,
        transform: [{ translateY: motion.position }],
      }]}
    >
      <Animated.Image
        testID="BorrowhoodRefresh.logo"
        source={require('../../assets/logo.png')}
        resizeMode="contain"
        accessible={false}
        style={[styles.logo, { transform: [
          { translateY: refreshing && !reduceMotion ? motion.lift : 0 },
          { scaleX: reduceMotion ? 1 : refreshing ? motion.bounceX : motion.scaleX },
          { scaleY: reduceMotion ? 1 : refreshing ? motion.bounceY : motion.scaleY },
        ] }]}
      />
    </Animated.View>
  );
}

// Preserve native refresh thresholds, bounce, and completion. The logo only
// replaces the visual on iOS; Android keeps its native swipe indicator.
const BorrowhoodRefreshList = forwardRef(function BorrowhoodRefreshList({
  refreshing,
  onRefresh,
  progressViewOffset = 0,
  scrollY: suppliedScrollY,
  onScroll,
  scrollEventThrottle = 16,
  ...props
}, ref) {
  const localScrollY = useRef(new Animated.Value(0)).current;
  const scrollY = suppliedScrollY ?? localScrollY;
  const scrollHandler = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  ), [scrollY]);
  const branded = Platform.OS === 'ios';

  return (
    <View style={styles.viewport}>
      {branded && <BorrowhoodRefreshIndicator scrollY={scrollY} refreshing={refreshing} top={progressViewOffset} />}
      <Animated.FlatList
        {...props}
        ref={ref}
        onScroll={onScroll ?? scrollHandler}
        scrollEventThrottle={scrollEventThrottle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={progressViewOffset}
            tintColor={branded ? 'transparent' : COLORS.spinner}
            colors={[COLORS.spinner]}
          />
        }
      />
    </View>
  );
});

export default BorrowhoodRefreshList;

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden' },
  indicator: { position: 'absolute', left: 0, right: 0, height: LOGO_SIZE, alignItems: 'center' },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});
