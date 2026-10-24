import { svgDataUri } from '../utils/svgSource';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../utils/config';
import { feedWoodlandSvg, getFeedWoodlandScene } from '../assets/feed-woodland-scenes';

export const FEED_HEADER_BACKGROUND = getFeedWoodlandScene(0).sky;

// Draw in the actual header's coordinates. Circle and tree geometry stays at
// its original proportions; a smaller ribbon crops the scene instead of warping it.
export default function FeedWoodlandBackdrop({ width = 402, sceneIndex = 0, height, topOffset = 0 }) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const onLayout = useCallback(({ nativeEvent: { layout } }) => {
    setFrame(previous => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
  }, []);
  const scene = getFeedWoodlandScene(sceneIndex);
  const artWidth = frame.width || width;
  const artHeight = height ?? (frame.height || 176);
  const source = useMemo(() => ({
    uri: svgDataUri(feedWoodlandSvg(sceneIndex, artWidth, artHeight)),
  }), [artWidth, sceneIndex, artHeight]);

  return <View testID="Woodland.frame" onLayout={onLayout} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, styles.clip]}>
    <LinearGradient colors={[scene.sky, COLORS.background]} style={[styles.landscape, { height: artHeight, top: topOffset }]} />
    <Image testID="Woodland.artwork" source={source} contentFit="cover" contentPosition="bottom" transition={0} accessible={false}
      style={[styles.landscape, { height: artHeight, top: topOffset }]} />
  </View>;
}
const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  landscape: { position: 'absolute', top: 0, left: 0, right: 0 },
});
