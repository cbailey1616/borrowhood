import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import WoodlandIllustration from './WoodlandIllustration';
import Icon from './Icon';
import VerificationComparison from './VerificationComparison';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function VerificationIntroduction({
  needsRetry = false,
  title = 'Verify to borrow across town',
  subtitle = 'Verification helps build trust between neighbors.',
}) {
  return (
    <>
      <View style={[styles.hero, !needsRetry && styles.trimmedHero]}>
        {needsRetry ? (
          <Icon name="alert-circle" size={72} color={COLORS.warning} />
        ) : (
          <WoodlandIllustration scene="neighborhood" width={260} style={styles.illustration} />
        )}
      </View>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <VerificationComparison />
      <Text style={styles.privacy}>
        Stripe handles verification and shares the result with Borrowhood.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: 4 },
  // Trim the scene's empty canvas vertically while preserving the drawing's size.
  trimmedHero: { height: 124, overflow: 'hidden' },
  illustration: { transform: [{ translateY: -20 }] },
  title: { ...TYPOGRAPHY.largeTitle, fontSize: 28, lineHeight: 32, color: COLORS.text, textAlign: 'center', maxWidth: 300, alignSelf: 'center' },
  subtitle: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 18, maxWidth: 300, alignSelf: 'center' },
  privacy: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, textAlign: 'center', marginTop: 16, paddingHorizontal: 8 },
});
