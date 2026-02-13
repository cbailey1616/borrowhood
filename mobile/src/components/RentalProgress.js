import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const STEPS = [
  { key: 'requested', icon: 'paper-plane', label: 'Sent' },
  { key: 'approved', icon: 'checkmark-circle', label: 'Approved' },
  { key: 'pickup', icon: 'cube', label: 'Picked Up' },
  { key: 'returned', icon: 'arrow-undo', label: 'Returned' },
  { key: 'complete', icon: 'trophy', label: 'Done' },
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

  // Build flat list: [circle, connector, circle, connector, ...]
  const elements = [];
  STEPS.forEach((step, index) => {
    const isComplete = index < activeStep;
    const isActive = index === activeStep;
    const isFuture = index > activeStep;

    // Add connector before circle (except first)
    if (index > 0) {
      const connectorDone = (isComplete || isActive) && !isCancelled;
      elements.push(
        <View
          key={`c-${index}`}
          style={[styles.connector, connectorDone && styles.connectorComplete]}
        />
      );
    }

    // Add circle
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
      {/* Circles + connectors in a single flat row */}
      <View style={styles.track}>
        {elements}
      </View>

      {/* Labels row */}
      <View style={styles.labelsRow}>
        {STEPS.map((step, index) => {
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

const CIRCLE_SIZE = 26;

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.md,
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
