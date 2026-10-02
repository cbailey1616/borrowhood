import React from 'react';
import { Text, StyleSheet } from 'react-native';
import VerificationComparison from './VerificationComparison';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function VerificationIntroduction({
  needsRetry = false,
  title = 'Verify to borrow across town',
  subtitle = 'Verification helps build trust between neighbors.',
}) {
  return (
    <>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <VerificationComparison />
      <Text style={styles.privacy}>
        Identity verification is securely provided by Stripe.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...TYPOGRAPHY.largeTitle, fontSize: TYPOGRAPHY.h1.fontSize, lineHeight: 32, color: COLORS.text, textAlign: 'left' },
  subtitle: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, textAlign: 'left', marginTop: 8, marginBottom: 24 },
  privacy: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, textAlign: 'left', marginTop: 16 },
});
