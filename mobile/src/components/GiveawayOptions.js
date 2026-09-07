import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import HapticPressable from './HapticPressable';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function GiveawayOptions({ mode, amount, onModeChange, onAmountChange }) {
  return <View style={styles.container}>
    <Text style={styles.label}>Free or for sale?</Text>
    <View style={styles.options}>
      {[['free', 'Free'], ['sell', 'Sell']].map(([value, label]) => (
        <HapticPressable key={value} accessibilityRole="radio" accessibilityLabel={label}
          accessibilityState={{ checked: mode === value }} onPress={() => onModeChange(value)}
          style={[styles.option, mode === value && styles.selected]}>
          <Text style={styles.label}>{label}</Text>
        </HapticPressable>
      ))}
    </View>
    {mode === 'sell' && <>
      <Text style={styles.label}>Sale price ($)</Text>
      <TextInput testID="Listing.input.salePrice" accessibilityLabel="Sale price" value={amount}
        onChangeText={onAmountChange} keyboardType="decimal-pad" placeholder="0.00"
        placeholderTextColor={COLORS.textSecondary} style={styles.input} />
      <Text style={styles.hint}>One-time price. Arrange payment directly with your neighbor. Borrowhood does not collect or process payments.</Text>
    </>}
    <Text style={styles.hint}>{mode === 'sell' ? 'The buyer keeps this item. No return expected.' : 'Free to keep. No return expected.'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: SPACING.sm, marginVertical: SPACING.md },
  options: { flexDirection: 'row', gap: SPACING.sm },
  option: { flex: 1, alignItems: 'center', padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  selected: { borderColor: COLORS.primary, backgroundColor: COLORS.illustration.mist },
  label: { ...TYPOGRAPHY.headline, color: COLORS.text },
  input: { padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, color: COLORS.text },
  hint: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
});
