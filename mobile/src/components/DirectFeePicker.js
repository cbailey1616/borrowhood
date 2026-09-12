import WholeDollarInput from './WholeDollarInput';
import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function DirectFeePicker({ enabled, amount, onToggle, onAmountChange }) {
  return <View style={styles.container}>
    <View style={styles.row}>
      <Text style={styles.label}>Charge a fee</Text>
      <Switch accessibilityLabel="Charge a fee" value={enabled} onValueChange={onToggle}
        trackColor={{ false: COLORS.illustration.mist, true: COLORS.primary }}
        ios_backgroundColor={COLORS.illustration.mist} thumbColor={COLORS.surface} />
    </View>
    {enabled && <>
      <Text style={styles.label}>Price per day ($)</Text>
      <WholeDollarInput accessibilityLabel="Price per day" value={amount} onChangeText={onAmountChange}
        placeholderTextColor={COLORS.textSecondary} style={styles.input} />
      <Text style={styles.hint}>Whole dollars only. Arrange payment directly with your neighbor. Borrowhood does not collect or process this fee.</Text>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: SPACING.sm, marginBottom: SPACING.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...TYPOGRAPHY.headline, color: COLORS.text },
  input: { padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, color: COLORS.text },
  hint: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
});
