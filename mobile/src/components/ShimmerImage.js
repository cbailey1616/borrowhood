import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import SkeletonShape from './SkeletonLoader';
import { getDecodedImage, loadDecodedImage } from '../utils/decodedImageCache';

export default function ShimmerImage({ source, ...props }) {
  const src = typeof source === 'object' && source?.uri ? source.uri : source;
  // A different photo gets its own state and native view. Changing recyclingKey
  // on an existing iOS ImageRef view can clear the image after source renders it.
  return <Photo key={typeof src === 'string' || typeof src === 'number' ? src : undefined} src={src} {...props} />;
}

function Photo({ src, style, ...imageProps }) {
  const canDecode = typeof src === 'string' && typeof Image.loadAsync === 'function';
  // A mounted view owns its decoded image. Another screen may evict and reload
  // this URL in the bounded cache; that must not replace an already visible ref.
  const [decoded, setDecoded] = useState(() => canDecode ? getDecodedImage(src) : null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => {
    if (!canDecode || decoded || decodeFailed) return;
    const cached = getDecodedImage(src);
    if (cached) {
      // The cache can finish loading between render and this effect. Publish
      // that result instead of skipping both the load and the state update.
      setDecoded(cached);
      return;
    }
    let active = true;
    loadDecodedImage(src).then(image => {
      if (active) setDecoded(image);
    }).catch(() => {
      if (active) setDecodeFailed(true);
    });
    return () => { active = false; };
  }, [src, canDecode, decoded, decodeFailed]);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  // Flatten style to extract width/height/borderRadius for the skeleton
  const flatStyle = StyleSheet.flatten(style) || {};
  return (
    <View style={[style, styles.container]}>
      {!decoded && !loaded && (
        <SkeletonShape
          width="100%"
          height="100%"
          borderRadius={flatStyle.borderRadius || 0}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Image
        // Let the decoder own the initial load. Sending the URL as well starts
        // an independent native load and later replaces it with the decoded ref.
        source={decoded || (!canDecode || decodeFailed ? src : null)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        onLoad={handleLoad}
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
