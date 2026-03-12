import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import SkeletonShape from './SkeletonLoader';

export default function ShimmerImage({ source, style, ...imageProps }) {
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  // Flatten style to extract width/height/borderRadius for the skeleton
  const flatStyle = StyleSheet.flatten(style) || {};

  // expo-image uses `source` as string or object
  const src = typeof source === 'object' && source?.uri ? source.uri : source;

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
      <Image
        source={src}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="disk"
        transition={300}
        onLoad={handleLoad}
        recyclingKey={typeof src === 'string' ? src : undefined}
        {...imageProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
