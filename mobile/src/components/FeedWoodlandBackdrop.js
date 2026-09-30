import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../utils/config';
import { feedWoodlandSvg, getFeedWoodlandScene } from '../assets/feed-woodland-scenes';

export const FEED_HEADER_BACKGROUND = getFeedWoodlandScene(0).sky;

// Decorative SVG stays light and sharp at every screen width. It never receives
// touches or enters the accessibility tree, so feed controls keep their behavior.
export default function FeedWoodlandBackdrop({ width = 402, sceneIndex = 0, height = 176, topOffset = 0 }) {
  const scene = getFeedWoodlandScene(sceneIndex);
  const source = useMemo(() => ({
    uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(feedWoodlandSvg(sceneIndex, width, height))}`,
  }), [width, sceneIndex, height]);

  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <LinearGradient colors={[scene.sky, COLORS.background]} style={[styles.landscape, { height, top: topOffset }]} />
    <Image testID="Woodland.artwork" source={source} contentFit="fill" transition={0} accessible={false}
      style={[styles.landscape, { height, top: topOffset }]} />
  </View>;
}

const styles = StyleSheet.create({
  landscape: { position: 'absolute', top: 0, left: 0, right: 0, height: 176 },
});
