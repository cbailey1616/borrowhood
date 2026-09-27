import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../utils/config';

const HEIGHT = 240;

function createFadeSvg(width) {
  const color = COLORS.background;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="300" viewBox="0 0 ${width} 300"><defs><radialGradient id="title"><stop offset="0" stop-color="${color}" stop-opacity=".86"/><stop offset=".55" stop-color="${color}" stop-opacity=".54"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><radialGradient id="tabs"><stop offset="0" stop-color="${color}" stop-opacity=".82"/><stop offset=".58" stop-color="${color}" stop-opacity=".52"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><ellipse cx="${width * 0.45}" cy="49" rx="${width * 0.61}" ry="86" fill="url(#title)"/><ellipse cx="${width / 2}" cy="239" rx="${width * 0.71}" ry="91" fill="url(#tabs)"/></svg>`;
}

export default function FeedHeaderTextFade({ width = 402 }) {
  const source = useMemo(() => ({
    uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createFadeSvg(width))}`,
  }), [width]);

  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
    <Image source={source} contentFit="fill" transition={0} accessible={false} style={styles.overlay} />
  </View>;
}

const styles = {
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, height: HEIGHT },
};
