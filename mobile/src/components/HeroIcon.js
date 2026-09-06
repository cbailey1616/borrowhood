import React from 'react';
import { View } from 'react-native';
import { FriendlyIcon } from './Icon';
import WoodlandIllustration from './WoodlandIllustration';

const SCENES = { home: 'neighborhood', people: 'neighborhood', basket: 'sharing', cube: 'sharing', heart: 'saved', chatbubble: 'messages', chatbubbles: 'messages', notifications: 'caughtUp' };

// One friendly object keeps empty states calm and easy to recognize.
export default function HeroIcon({ icon = 'swap-horizontal', size = 84 }) {
  const scene = SCENES[String(icon).replace(/-outline$/, '')];
  if (scene && size >= 72) return <WoodlandIllustration scene={scene} width={size * 2} />;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <FriendlyIcon name={icon} size={size * 0.8} illustrated />
    </View>
  );
}
