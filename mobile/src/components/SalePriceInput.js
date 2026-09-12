import WholeDollarInput from './WholeDollarInput';
import { View, Text, } from 'react-native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
export default function SalePriceInput({ amount, onChange }) {
  return <View style={{ gap: SPACING.sm, marginVertical: SPACING.md }}>
    <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>Sale price ($)</Text>
    <WholeDollarInput accessibilityLabel="Sale price" value={amount} onChangeText={onChange}
      placeholderTextColor={COLORS.textSecondary}
      style={{ padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, color: COLORS.text }} />
    <Text style={{ ...TYPOGRAPHY.caption1, color: COLORS.textSecondary }}>Whole dollars only. The buyer keeps the item. Arrange payment directly with your neighbor.</Text>
  </View>;
}
