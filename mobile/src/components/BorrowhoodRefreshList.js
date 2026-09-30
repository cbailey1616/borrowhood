import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { COLORS } from '../utils/config';
import { haptics } from '../utils/haptics';

const LOGO_SIZE = 56;
export const REBOUND_MS = 200;
export const SPIN_MS = 1000;
export const MIN_REFRESH_MS = 1800;

export function BorrowhoodRefreshIndicator({ scrollY, refreshing, top = 0, visible = true }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
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
      spin.setValue(0);
      return;
    }
    bounce.setValue(1.8);
    spin.setValue(0);
    const options = { useNativeDriver: true, isInteraction: false };
    const animation = Animated.sequence([
      Animated.timing(bounce, { ...options, toValue: 0, duration: REBOUND_MS, easing: Easing.out(Easing.quad) }),
      Animated.loop(Animated.timing(spin, { ...options, toValue: 1, duration: SPIN_MS, easing: Easing.linear })),
    ]);
    animation.start();
    return () => {
      animation.stop();
      bounce.setValue(0);
      spin.setValue(0);
    };
  }, [bounce, spin, refreshing, reduceMotion]);

  const motion = useMemo(() => ({
    opacity: scrollY.interpolate({ inputRange: [-20, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
    position: scrollY.interpolate({ inputRange: [-200, 0], outputRange: [100, 0], extrapolate: 'clamp' }),
    scaleX: scrollY.interpolate({ inputRange: [-200, -48, 0], outputRange: [0.78, 1, 0.6], extrapolate: 'clamp' }),
    scaleY: scrollY.interpolate({ inputRange: [-200, -48, 0], outputRange: [1.65, 1, 0.6], extrapolate: 'clamp' }),
    bounceX: bounce.interpolate({ inputRange: [0, 1, 1.8], outputRange: [1, 0.94, 0.84], extrapolate: 'clamp' }),
    bounceY: bounce.interpolate({ inputRange: [0, 1, 1.8], outputRange: [1, 1.12, 1.4], extrapolate: 'clamp' }),
    lift: bounce.interpolate({ inputRange: [0, 1, 1.8], outputRange: [0, -3, 0], extrapolate: 'clamp' }),
    rotation: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
  }), [bounce, spin, scrollY]);

  return (
    <Animated.View
      testID="BorrowhoodRefresh.indicator"
      pointerEvents="none"
      accessible={visible && refreshing}
      accessibilityRole="progressbar"
      accessibilityLabel="Refreshing"
      accessibilityState={{ busy: refreshing }}
      accessibilityElementsHidden={!visible || !refreshing}
      importantForAccessibility={visible && refreshing ? 'yes' : 'no-hide-descendants'}
      style={[styles.indicator, {
        top: top - LOGO_SIZE / 2,
        opacity: visible ? motion.opacity : 0,
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
          { rotate: reduceMotion ? '0deg' : motion.rotation },
        ] }]}
      />
    </Animated.View>
  );
}

// Share gesture timing and feedback across lists and keyboard-aware plan pages.
export function useBorrowhoodRefresh({ refreshing, onRefresh, suppliedScrollY, nativeScroll = true }) {
  const localScrollY = useRef(new Animated.Value(0)).current;
  const scrollY = suppliedScrollY ?? localScrollY;
  const branded = Platform.OS === 'ios';
  const focused = useIsFocused();
  const pulling = useRef(false);
  const [isPulling, setIsPulling] = useState(false);
  const endPull = () => { pulling.current = false; setIsPulling(false); };
  const beginPull = () => { if (focused) { pulling.current = true; setIsPulling(true); } };
  useEffect(() => { if (!focused) { pulling.current = false; setIsPulling(false); armed.current = false; } }, [focused]);
  const [holding, setHolding] = useState(refreshing);
  const [cycle, setCycle] = useState(0);
  const started = useRef(refreshing ? Date.now() : null);
  const armed = useRef(false);
  const active = useRef(refreshing);
  useEffect(() => {
    if (!branded) return;
    const listener = scrollY.addListener(({ value }) => {
      if (pulling.current && value <= -72 && !armed.current && !active.current) {
        armed.current = true;
        haptics.light();
      }
      if (value >= -12 && !active.current) armed.current = false;
    });
    return () => scrollY.removeListener(listener);
  }, [branded, scrollY]);
  useEffect(() => {
    if (refreshing) {
      active.current = true;
      if (started.current === null) started.current = Date.now();
      setHolding(true);
      return;
    }
    if (started.current === null) return;
    const remaining = branded ? Math.max(0, MIN_REFRESH_MS - (Date.now() - started.current)) : 0;
    const timer = setTimeout(() => {
      started.current = null;
      active.current = false;
      armed.current = false;
      setHolding(false);
      if (branded) haptics.light();
    }, remaining);
    return () => clearTimeout(timer);
  }, [refreshing, cycle, branded]);
  const handleRefresh = () => {
    if (active.current) return;
    active.current = true;
    started.current = Date.now();
    if (branded) {
      if (!armed.current) haptics.light();
      setHolding(true);
    }
    setCycle(c => c + 1);
    onRefresh?.();
  };
  const scrollHandler = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: nativeScroll },
  ), [scrollY, nativeScroll]);
  const visibleRefreshing = refreshing || (branded && holding);

  return { scrollY, branded, visibleRefreshing, handleRefresh, scrollHandler, beginPull, endPull, indicatorVisible: focused && (isPulling || visibleRefreshing) };
}

// Feed's pinned ribbon sits above its list. indicatorTop puts the hat in the
// gap BELOW that ribbon; pages with a separate header use the viewport's top.
const BorrowhoodRefreshList = forwardRef(function BorrowhoodRefreshList({
  refreshing,
  onRefresh,
  progressViewOffset = 0,
  indicatorTop = 0,
  scrollY: suppliedScrollY,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  scrollEventThrottle = 16,
  ...props
}, ref) {
  const { scrollY, branded, visibleRefreshing, handleRefresh, scrollHandler, beginPull, endPull, indicatorVisible } = useBorrowhoodRefresh({ refreshing, onRefresh, suppliedScrollY });
  return (
    <View style={styles.viewport}>
      {branded && <BorrowhoodRefreshIndicator scrollY={scrollY} refreshing={visibleRefreshing} visible={indicatorVisible} top={indicatorTop} />}
      <Animated.FlatList
        {...props}
        ref={ref}
        onScroll={onScroll ?? scrollHandler}
        onScrollBeginDrag={event => { beginPull(); onScrollBeginDrag?.(event); }}
        onScrollEndDrag={event => { endPull(); onScrollEndDrag?.(event); }}
        scrollEventThrottle={scrollEventThrottle}
        refreshControl={
          <RefreshControl
            refreshing={visibleRefreshing}
            onRefresh={handleRefresh}
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
