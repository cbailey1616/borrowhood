import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const STEPS = [
  { key: 'requested', icon: 'paper-plane', label: 'Requested' },
  { key: 'approved', icon: 'checkmark-circle', label: 'Approved' },
  { key: 'pickup', icon: 'cube', label: 'Picked Up' },
  { key: 'returned', icon: 'arrow-undo', label: 'Returned' },
  { key: 'complete', icon: 'trophy', label: 'Complete' },
];

function getActiveStep(status) {
  switch (status) {
    case 'pending': return 0;
    case 'approved':
    case 'paid': return 1;
    case 'picked_up': return 2;
    case 'returned':
    case 'return_pending': return 3;
    case 'completed': return 4;
    default: return -1; // cancelled/disputed
  }
}

function getStepDescription(status, isBorrower, paymentStatus) {
  switch (status) {
    case 'pending':
      if (isBorrower) {
        return paymentStatus === 'authorized'
          ? 'Your payment is on hold. Waiting for the lender to accept your request.'
          : 'Your request has been sent to the lender.';
      }
      return paymentStatus === 'authorized'
        ? "The borrower's payment is on hold. Approve to collect payment."
        : 'You have a new borrow request to review.';
    case 'approved':
    case 'paid':
      if (isBorrower) return 'Your request was approved! Arrange a time to pick up the item.';
      return 'You approved the request. The borrower will pick up the item soon.';
    case 'picked_up':
      if (isBorrower) return 'You have the item. Return it before the end date.';
      return 'Your item is with the borrower. They need to return it by the end date.';
    case 'returned':
    case 'return_pending':
      if (isBorrower) return 'The item has been returned. Waiting for rating.';
      return 'Your item has been returned. Leave a rating to complete the transaction.';
    case 'completed':
      return 'Transaction complete! Both parties have rated.';
    case 'cancelled':
      if (isBorrower) return 'You cancelled this request. Any payment hold was released.';
      return 'This request was declined or cancelled.';
    case 'disputed':
      return 'There is an open dispute on this transaction.';
    default:
      return '';
  }
}

export default function RentalProgress({ status, isBorrower, paymentStatus }) {
  const activeStep = getActiveStep(status);
  const isCancelled = status === 'cancelled' || status === 'disputed';
  const description = getStepDescription(status, isBorrower, paymentStatus);

  return (
    <View style={styles.container}>
      {/* Step indicators */}
      <View style={styles.stepsRow}>
        {STEPS.map((step, index) => {
          const isComplete = index < activeStep;
          const isActive = index === activeStep;
          const isFuture = index > activeStep;

          return (
            <View key={step.key} style={styles.stepWrapper}>
              {/* Connector line (before step, except first) */}
              {index > 0 && (
                <View
                  style={[
                    styles.connector,
                    styles.connectorLeft,
                    isComplete && styles.connectorComplete,
                    isActive && styles.connectorComplete,
                    isCancelled && styles.connectorCancelled,
                  ]}
                />
              )}

              {/* Step circle */}
              <View
                style={[
                  styles.stepCircle,
                  isComplete && styles.stepCircleComplete,
                  isActive && styles.stepCircleActive,
                  isCancelled && isActive && styles.stepCircleCancelled,
                  isFuture && styles.stepCircleFuture,
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : isCancelled && isActive ? (
                  <Ionicons name="close" size={14} color="#fff" />
                ) : (
                  <Ionicons
                    name={step.icon}
                    size={14}
                    color={isActive ? '#fff' : COLORS.gray[500]}
                  />
                )}
              </View>

              {/* Connector line (after step, except last) */}
              {index < STEPS.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    styles.connectorRight,
                    isComplete && styles.connectorComplete,
                    isCancelled && styles.connectorCancelled,
                  ]}
                />
              )}

              {/* Label */}
              <Text
                style={[
                  styles.stepLabel,
                  isComplete && styles.stepLabelComplete,
                  isActive && styles.stepLabelActive,
                  isCancelled && isActive && styles.stepLabelCancelled,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Description */}
      {description ? (
        <View style={styles.descriptionCard}>
          <Ionicons
            name={isCancelled ? 'alert-circle' : 'information-circle'}
            size={18}
            color={isCancelled ? COLORS.danger : COLORS.primary}
          />
          <Text style={styles.descriptionText}>{description}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  stepWrapper: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    top: 14,
    height: 2,
    backgroundColor: COLORS.gray[700],
  },
  connectorLeft: {
    left: 0,
    right: '50%',
    marginRight: 14,
  },
  connectorRight: {
    left: '50%',
    right: 0,
    marginLeft: 14,
  },
  connectorComplete: {
    backgroundColor: COLORS.primary,
  },
  connectorCancelled: {
    backgroundColor: COLORS.gray[700],
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray[700],
    zIndex: 1,
  },
  stepCircleComplete: {
    backgroundColor: COLORS.primary,
  },
  stepCircleActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  stepCircleCancelled: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
  },
  stepCircleFuture: {
    backgroundColor: COLORS.gray[800],
  },
  stepLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.gray[500],
    marginTop: SPACING.xs,
    textAlign: 'center',
    fontSize: 10,
  },
  stepLabelComplete: {
    color: COLORS.primary,
  },
  stepLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  stepLabelCancelled: {
    color: COLORS.danger,
  },
  descriptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  descriptionText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
