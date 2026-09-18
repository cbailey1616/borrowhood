import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';

// The header lives outside the bouncing list. Only actual browsing offsets can
// hide it; a negative iOS pull (and its rebound to zero) must leave it in place.
export default function useFeedHeader({ pinned = false, columns = 1 } = {}) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);
  const translateY = useMemo(() => {
    const browsingY = scrollY.interpolate({
      inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp',
    });
    const hidden = columns === 1
      ? Animated.diffClamp(browsingY, 0, height)
      : browsingY.interpolate({
        inputRange: [0, Math.max(1, height)], outputRange: [0, height], extrapolate: 'clamp',
      });
    return Animated.multiply(hidden, -1);
  }, [scrollY, height, columns]);
  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  ), [scrollY]);
  const onLayout = useCallback(event => setHeight(event.nativeEvent.layout.height), []);

  // FlatList remounts when its column count changes.
  useLayoutEffect(() => { scrollY.setValue(0); }, [scrollY, columns]);

  return { height, onLayout, onScroll, style: { transform: [{ translateY: pinned ? 0 : translateY }] } };
}
