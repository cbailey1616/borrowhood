import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import SkeletonShape from './SkeletonLoader';

export default function ShimmerImage({ source, style, ...imageProps }) {
  const src = typeof source === 'object' && source?.uri ? source.uri : source;
  const [loadedSource, setLoadedSource] = useState(null);
  const loaded = loadedSource === src;

  const handleLoad = useCallback(() => {
    setLoadedSource(src);
  }, [src]);

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
      <Image
        source={src}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
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
