import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import SkeletonShape from './SkeletonLoader';
import { getDecodedImage, loadDecodedImage } from '../utils/decodedImageCache';
import { imageIdentity } from '../utils/imageIdentity';
import Icon from './Icon';
import { COLORS } from '../utils/config';

export default function ShimmerImage({ source, placeholderIcon = 'image', ...props }) {
  const src = source && typeof source === 'object' && 'uri' in source ? source.uri : source;
  if (!src || (typeof src === 'string' && src.startsWith('https://via.placeholder.com/'))) {
    return <PhotoFallback style={props.style} icon={placeholderIcon} label={props.accessibilityLabel} />;
  }
  // A different photo gets its own state and native view. Changing recyclingKey
  // on an existing iOS ImageRef view can clear the image after source renders it.
  const key = imageIdentity(src);
  return <Photo key={typeof key === 'string' || typeof key === 'number' ? key : undefined} src={src} placeholderIcon={placeholderIcon} {...props} />;
}

function PhotoFallback({ style, icon, label = 'Photo unavailable' }) {
  const width = StyleSheet.flatten(style)?.width;
  return <View accessibilityLabel={label} accessibilityRole="image" style={[style, styles.fallback]}>
    <Icon name={icon} size={typeof width === 'number' ? Math.min(44, width * 0.55) : 32} illustrated />
  </View>;
}

function Photo({ src, style, placeholderIcon, onError, onLoad, ...imageProps }) {
  // Small avatars use Expo's image cache without evicting decoded listing photos.
  const canDecode = placeholderIcon !== 'person' && typeof src === 'string' && typeof Image.loadAsync === 'function';
  const nativeSource = useMemo(() => {
    const key = imageIdentity(src);
    return key !== src ? { uri: src, cacheKey: key } : src;
  }, [src]);
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
  const [failedUri, setFailedUri] = useState(null);

  const handleLoad = useCallback(event => {
    setLoaded(true);
    setFailedUri(null);
    onLoad?.(event);
  }, [onLoad]);

  if (failedUri === src) return <PhotoFallback style={style} icon={placeholderIcon} />;

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
        source={decoded || (!canDecode || decodeFailed ? nativeSource : null)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        onLoad={handleLoad}
        onError={event => { setFailedUri(src); onError?.(event); }}
        {...imageProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  container: {
    overflow: 'hidden',
  },
});
