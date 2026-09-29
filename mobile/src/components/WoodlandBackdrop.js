import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../utils/config';
import FeedWoodlandBackdrop from './FeedWoodlandBackdrop';
import { feedWoodlandSvg, getFeedWoodlandScene } from '../assets/feed-woodland-scenes';

// Read the session's selection; mounting another screen never advances it.
export default function WoodlandBackdrop({ fullScreen = false }) {
  const { width } = useWindowDimensions();
  let feedWoodlandScene = 0;
  try { feedWoodlandScene = useAuth().feedWoodlandScene ?? 0; }
  catch { /* Pre-auth onboarding can render without AuthProvider. */ }
  const scene = getFeedWoodlandScene(feedWoodlandScene);
  const source = useMemo(() => {
    const svg = feedWoodlandSvg(feedWoodlandScene, width, 264);
    return { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
  }, [feedWoodlandScene, width]);
  if (!fullScreen) return <FeedWoodlandBackdrop width={width} sceneIndex={feedWoodlandScene} />;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <LinearGradient colors={[scene.sky, COLORS.background, scene.sky]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
    <Image source={source} contentFit="fill" transition={0} accessible={false} style={styles.landscape} />
  </View>;
}
const styles = StyleSheet.create({
  landscape: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 264, opacity: 0.65 },
});
