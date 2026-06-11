import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from './Icon';

// Large, friendly hero badge for empty states and onboarding moments — a soft
// gradient disc with a white glyph, light rim and a gentle drop glow. Replaces
// flat single-glyph-in-a-tinted-circle (and bare emoji) empty states. Same
// crafted language as the rank/category emblems, scaled up and softened.
//
// `colors` overrides the gradient (default = brand forest green); pass a tint
// per onboarding step to keep things lively.
export default function HeroIcon({ icon = 'sparkles', size = 84, colors, glow = true }) {
  const grad = colors || ['#3E8E5A', '#1C5230'];
  // Pad the wrapper so the drop shadow has room to render outside the disc
  // (the disc itself uses overflow:hidden to clip the gloss, which would
  // otherwise clip the shadow into a square via masksToBounds).
  const pad = glow ? Math.ceil(size * 0.22) : 0;
  return (
    <View style={{ width: size + pad * 2, height: size + pad * 2, alignItems: 'center', justifyContent: 'center' }}>
      {/* shadow carrier — NOT clipped */}
      <View
        style={[
          { width: size, height: size, borderRadius: size / 2 },
          glow && {
            shadowColor: grad[grad.length - 1],
            shadowOpacity: 0.4,
            shadowRadius: size * 0.16,
            shadowOffset: { width: 0, height: size * 0.06 },
            elevation: 6,
          },
        ]}
      >
        {/* disc — clips the gloss + gradient corners (no white rim) */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={grad}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.4, backgroundColor: 'rgba(255,255,255,0.16)' }} />
            <Ionicons name={icon} size={size * 0.46} color="#fff" />
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}
