import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from './Icon';

// Identity-verification seal — a green gradient disc with a white check, in the
// same crafted language as the rank emblems. Replaces flat shield-checkmark
// glyphs wherever a user/community is "verified". `glow` adds a soft halo for
// larger, prominent placements.
export default function VerifiedBadge({ size = 18, glow = false }) {
  const ring = Math.max(1, size * 0.07);
  const pad = glow ? Math.ceil(size * 0.28) : 0;
  return (
    <View style={{ width: size + pad * 2, height: size + pad * 2, alignItems: 'center', justifyContent: 'center' }}>
      {/* shadow carrier — not clipped, so the glow isn't squared by masksToBounds */}
      <View
        style={[
          { width: size, height: size, borderRadius: size / 2 },
          glow && {
            shadowColor: '#2EA567',
            shadowOpacity: 0.75,
            shadowRadius: size * 0.22,
            shadowOffset: { width: 0, height: 0 },
            elevation: 4,
          },
        ]}
      >
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={['#4ABE7B', '#1E7A48']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.42, backgroundColor: 'rgba(255,255,255,0.22)' }} />
            <Ionicons name="checkmark-sharp" size={size * 0.62} color="#fff" />
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}
