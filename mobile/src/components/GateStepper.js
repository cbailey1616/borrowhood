import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

const STEP_LABELS = {
  1: 'Verify & Pay',
  2: 'Identity Check',
  3: 'Payout Setup',
};

export default function GateStepper({ currentStep, totalSteps, source }) {
  const steps = [];
  for (let i = 1; i <= totalSteps; i++) {
    steps.push(i);
  }

  return (
    <View style={styles.container}>
      {steps.map((step, idx) => {
        const isComplete = step < currentStep;
        const isCurrent = step === currentStep;

        return (
          <View key={step} style={styles.stepRow}>
            {/* Connector line before (except first) */}
            {idx > 0 && (
              <View style={[styles.line, isComplete || isCurrent ? styles.lineActive : null]} />
            )}

            {/* Circle */}
            <View
              style={[
                styles.circle,
                isComplete && styles.circleComplete,
                isCurrent && styles.circleCurrent,
              ]}
            >
              {isComplete ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.circleText,
                    isCurrent && styles.circleTextCurrent,
                  ]}
                >
                  {step}
                </Text>
              )}
            </View>

            {/* Label */}
            <Text
              style={[
                styles.label,
                isComplete && styles.labelComplete,
                isCurrent && styles.labelCurrent,
              ]}
              numberOfLines={1}
            >
              {STEP_LABELS[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  line: {
    width: 20,
    height: 2,
    backgroundColor: COLORS.gray[700],
    borderRadius: 1,
  },
  lineActive: {
    backgroundColor: COLORS.primary,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.gray[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleComplete: {
    backgroundColor: COLORS.primary,
  },
  circleCurrent: {
    backgroundColor: COLORS.primary,
  },
  circleText: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 11,
  },
  circleTextCurrent: {
    color: '#fff',
  },
  label: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
    fontSize: 11,
  },
  labelComplete: {
    color: COLORS.primary,
  },
  labelCurrent: {
    color: COLORS.text,
    fontWeight: '600',
  },
});
