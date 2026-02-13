import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS, SPACING } from '../utils/config';

const BORROWER_STEPS = [
  { key: 'requested', icon: 'paper-plane', label: 'Request' },
  { key: 'approved', icon: 'checkmark-circle', label: 'Accepted' },
  { key: 'pickup', icon: 'cube', label: 'Pickup' },
  { key: 'returned', icon: 'arrow-undo', label: 'Return' },
];

const LENDER_STEPS = [
  { key: 'requested', icon: 'paper-plane', label: 'Request' },
  { key: 'approved', icon: 'checkmark-circle', label: 'Approved' },
  { key: 'pickup', icon: 'cube', label: 'Picked Up' },
  { key: 'returned', icon: 'arrow-undo', label: 'Returned' },
];

function getActiveStep(status) {
  switch (status) {
    case 'pending': return 0;
    case 'approved':
    case 'paid': return 1;
    case 'picked_up': return 2;
    case 'returned':
    case 'return_pending':
    case 'completed': return 3;
    default: return -1;
  }
}

export default function RentalProgress({ status, isBorrower }) {
  const activeStep = getActiveStep(status);
  const isCancelled = status === 'cancelled' || status === 'disputed';
  const steps = isBorrower ? BORROWER_STEPS : LENDER_STEPS;

  const elements = [];
  steps.forEach((step, index) => {
    const isComplete = index < activeStep;
    const isActive = index === activeStep;
    const isFuture = index > activeStep;

    if (index > 0) {
      const connectorDone = (isComplete || isActive) && !isCancelled;
      elements.push(
        <View
          key={`c-${index}`}
          style={[styles.connector, connectorDone && styles.connectorComplete]}
        />
      );
    }

    elements.push(
      <View
        key={step.key}
        style={[
          styles.circle,
          isComplete && styles.circleComplete,
          isActive && !isCancelled && styles.circleActive,
          isCancelled && isActive && styles.circleCancelled,
          isFuture && styles.circleFuture,
        ]}
      >
        {isComplete ? (
          <Ionicons name="checkmark" size={12} color="#fff" />
        ) : isCancelled && isActive ? (
          <Ionicons name="close" size={12} color="#fff" />
        ) : (
          <Ionicons
            name={step.icon}
            size={12}
            color={isActive ? '#fff' : COLORS.gray[500]}
          />
        )}
      </View>
    );
  });

  return (
    <View style={styles.container}>
      <View style={styles.track}>{elements}</View>
      <View style={styles.labelsRow}>
        {steps.map((step, index) => {
          const isComplete = index < activeStep;
          const isActive = index === activeStep;

          return (
            <Text
              key={step.key}
              style={[
                styles.label,
                isComplete && styles.labelComplete,
                isActive && !isCancelled && styles.labelActive,
                isCancelled && isActive && styles.labelCancelled,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const CIRCLE_SIZE = 26;

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.gray[700],
  },
  connectorComplete: {
    backgroundColor: COLORS.primary,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray[700],
  },
  circleComplete: {
    backgroundColor: COLORS.primary,
  },
  circleActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  circleCancelled: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  circleFuture: {
    backgroundColor: COLORS.gray[800],
  },
  labelsRow: {
    flexDirection: 'row',
    marginTop: SPACING.xs,
    marginHorizontal: SPACING.md,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: COLORS.gray[500],
  },
  labelComplete: {
    color: COLORS.primary,
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  labelCancelled: {
    color: COLORS.danger,
    fontWeight: '700',
  },
});
