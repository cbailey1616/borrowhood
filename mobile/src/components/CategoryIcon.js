import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from './Icon';

// Branded category tiles — a gradient rounded-square with the white glyph,
// distinct color per category. Same visual language as the rank emblems, but
// square (suits category grids/pickers). Keyed by the Ionicon name the API /
// CATEGORY_ICONS supplies, so it works wherever `cat.icon` is available.
const CATEGORY_STYLES = {
  'hammer-outline':               ['#F0A93E', '#C0392B'], // tools & hardware
  'restaurant-outline':           ['#FF8A65', '#D8434E'], // kitchen & cooking
  'leaf-outline':                 ['#5FC27E', '#1E5631'], // garden & outdoor
  'football-outline':             ['#5AA9F0', '#2E5FC0'], // sports & recreation
  'laptop-outline':               ['#9B7BE8', '#5B3FB0'], // electronics & tech
  'gift-outline':                 ['#F178B6', '#C0398A'], // party & events
  'happy-outline':                ['#46C9C3', '#1E8A86'], // kids & baby
  'bonfire-outline':              ['#FFB35C', '#E0653A'], // camping & travel
  'sparkles-outline':             ['#6FD3F2', '#2E8FC0'], // cleaning
  'ellipsis-horizontal-outline':  ['#A9BACE', '#6E869F'], // other
};
const DEFAULT_GRAD = ['#A9BACE', '#6E869F'];

export default function CategoryIcon({ icon, size = 40, radius }) {
  const name = icon || 'pricetag-outline';
  const grad = CATEGORY_STYLES[name] || DEFAULT_GRAD;
  const r = radius != null ? radius : size * 0.28;
  // Use the filled glyph variant for a bolder, more crafted look on the tile.
  const glyph = name.replace('-outline', '');

  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}>
      <LinearGradient
        colors={grad}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* top gloss */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.42, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <Ionicons name={glyph} size={size * 0.52} color="#fff" />
      </LinearGradient>
    </View>
  );
}
