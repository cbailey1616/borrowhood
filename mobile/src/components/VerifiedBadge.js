import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import HapticPressable from './HapticPressable';
import ActionSheet from './ActionSheet';
import { Ionicons } from './Icon';
import { COLORS } from '../utils/config';

// A compact, legible identity mark at every size. No decorative glow.
export default function VerifiedBadge({ size = 18, interactive = false }) {
  if (interactive) return <IdentityInfoBadge size={size} />;
  return (
    <View accessible accessibilityLabel="Verified identity" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="identity-seal" size={size} color={COLORS.primary} />
    </View>
  );
}

function IdentityInfoBadge({ size }) {
  const [visible, setVisible] = useState(false);
  const { user } = useAuth();
  const navigation = useNavigation();
  const verified = user?.isVerified === true;
  return <>
    <HapticPressable accessibilityRole="button" accessibilityLabel="Verified identity"
      accessibilityHint="Learn about identity verification"
      hitSlop={8}
      onPress={event => { event?.stopPropagation?.(); setVisible(true); }}
      style={{ width: size + 4, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="identity-seal" size={size} color={COLORS.primary} />
    </HapticPressable>
    {visible && <ActionSheet isVisible onClose={() => setVisible(false)}
      title="A little extra peace of mind"
      message={`This person’s identity has been verified. It helps you know who you’re sharing with.${!verified ? '\n\nBuild trust in your town. Get verified with a quick ID and selfie check.' : ''}\n\nVerification confirms identity, not a guarantee of someone’s behavior.`}
      cancelLabel="Got it"
      actions={verified ? [] : [{ label: 'Build town trust · Get verified',
        icon: <Ionicons name="shield-checkmark" size={28} illustrated />,
        onPress: () => navigation.navigate('IdentityVerification', { source: 'identity_badge' }),
      }]} />}
  </>;
}
