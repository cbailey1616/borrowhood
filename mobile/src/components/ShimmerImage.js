import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import SkeletonShape from './SkeletonLoader';
import { getDecodedImage, loadDecodedImage } from '../utils/decodedImageCache';

export default function ShimmerImage({ source, style, ...imageProps }) {
  const src = typeof source === 'object' && source?.uri ? source.uri : source;
  const canDecode = typeof src === 'string' && typeof Image.loadAsync === 'function';
  const [decoded, setDecoded] = useState(() => ({ uri: src, image: canDecode ? getDecodedImage(src) : null }));
  const cached = canDecode ? getDecodedImage(src) : null;
  const readyImage = cached || (decoded.uri === src ? decoded.image : null);
  useEffect(() => {
    if (!canDecode || getDecodedImage(src)) return;
    let active = true;
    loadDecodedImage(src).then(image => {
      if (active) setDecoded({ uri: src, image });
    }).catch(() => { /* The normal image loader below retains its retry/error behavior. */ });
    return () => { active = false; };
  }, [src, canDecode]);
  const [loadedSource, setLoadedSource] = useState(null);
  const loaded = !!readyImage || loadedSource === src;

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
        source={readyImage || src}
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
