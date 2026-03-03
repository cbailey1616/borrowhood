import React, { useState, useCallback } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import SkeletonShape from './SkeletonLoader';

const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function ShimmerImage({ style, ...imageProps }) {
  const [loaded, setLoaded] = useState(false);
  const opacity = useSharedValue(0);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
  }, []);

  const imageAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Flatten style to extract width/height/borderRadius for the skeleton
  const flatStyle = StyleSheet.flatten(style) || {};

  return (
    <View style={[style, styles.container]}>
      {!loaded && (
        <SkeletonShape
          width="100%"
          height="100%"
          borderRadius={flatStyle.borderRadius || 0}
          style={StyleSheet.absoluteFill}
        />
      )}
      <AnimatedImage
        {...imageProps}
        style={[StyleSheet.absoluteFill, imageAnimStyle]}
        onLoad={handleLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
