import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS, SPACING } from '../utils/config';

export default function RentalProgress({ status, isBorrower, isGiveaway, isSale = false }) {
  const steps = [
    { icon: 'request-note', label: 'Requested' },
    { icon: 'checkmark-circle', label: 'Approved' },
    { icon: isGiveaway ? 'gift' : 'basket', label: isGiveaway && !isBorrower ? (isSale ? 'Sold' : 'Given') : 'Picked up' },
    ...(!isGiveaway ? [{ icon: 'home', label: status === 'return_pending' ? 'Return pending' : 'Returned' }] : []),
  ];
  const active = ({ pending: 0, approved: 1, paid: 1, picked_up: 2, return_pending: steps.length - 1, returned: steps.length - 1, completed: steps.length - 1 })[status] ?? -1;
  const stopped = ['cancelled', 'disputed'].includes(status);
  const finished = ['returned', 'completed'].includes(status);
  return <View style={styles.track} accessibilityLabel={stopped ? 'Exchange paused or cancelled' : `Exchange progress: ${steps[active]?.label || status}`}>
    {steps.map((step, index) => {
      const complete = !stopped && (index < active || finished);
      const current = !stopped && index === active;
      return <View key={step.label} style={styles.step}>
        {index < steps.length - 1 && <View style={[styles.line, complete && styles.lineComplete]} />}
        <View style={[styles.iconCircle, current && styles.active, complete && styles.complete]}>
          <View style={{ opacity: stopped || index > active ? 0.55 : 1 }}><Ionicons name={step.icon} size={30} illustrated color={COLORS.primary} /></View>
          {complete && <View style={styles.check}><Ionicons name="checkmark" size={10} color={COLORS.surface} /></View>}
        </View>
        <Text style={[styles.label, current && styles.activeLabel]}>{step.label}</Text>
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  track: { flexDirection: 'row', paddingVertical: SPACING.sm },
  step: { flex: 1, alignItems: 'center' },
  line: { position: 'absolute', top: 24, left: '50%', width: '100%', height: 2, backgroundColor: COLORS.border },
  lineComplete: { backgroundColor: COLORS.primary },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  active: { backgroundColor: COLORS.primaryMuted, borderColor: '#B59A53', borderWidth: 2 },
  complete: { backgroundColor: COLORS.primaryMuted, borderColor: COLORS.primary },
  check: { position: 'absolute', right: -2, bottom: -2, width: 17, height: 17, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  label: { textAlign: 'center', fontSize: 11, lineHeight: 15, marginTop: 9, paddingHorizontal: 2, color: COLORS.textSecondary },
  activeLabel: { color: COLORS.primary, fontWeight: '700' },
});
