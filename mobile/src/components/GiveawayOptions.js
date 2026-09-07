import React from 'react';
import { Text } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function GiveawayOptions() {
  return <Text style={{ ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, marginVertical: SPACING.md }}>Free to keep. No return expected.</Text>;
}
