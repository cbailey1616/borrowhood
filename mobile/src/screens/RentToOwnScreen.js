import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS } from '../utils/config';

const PAYMENT_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function RentToOwnScreen({ navigation, route }) {
  const { listing } = route.params;
  const [loading, setLoading] = useState(false);
  const [totalPayments, setTotalPayments] = useState(12);
  const [paymentFrequency, setPaymentFrequency] = useState('monthly');

  const purchasePrice = listing.rtoPurchasePrice || 0;
  const rentalCreditPercent = listing.rtoRentalCreditPercent || 50;

  // Calculate payment breakdown
  const equityPerPayment = purchasePrice / totalPayments;
  const paymentAmount = equityPerPayment / (rentalCreditPercent / 100);
  const rentalPerPayment = paymentAmount - equityPerPayment;

  // Calculate first payment date (next applicable date)
  const getFirstPaymentDate = () => {
    const date = new Date();
    if (paymentFrequency === 'weekly') {
      date.setDate(date.getDate() + 7);
    } else if (paymentFrequency === 'biweekly') {
      date.setDate(date.getDate() + 14);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    return date;
  };

  const formatCurrency = (amount) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSubmit = async () => {
    Alert.alert(
      'Confirm Request',
      `You're requesting to rent-to-own "${listing.title}" with ${totalPayments} ${paymentFrequency} payments of ${formatCurrency(paymentAmount)}. The owner will be notified to approve.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Request',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await api.createRTOContract({
                listingId: listing.id,
                totalPayments,
                paymentFrequency,
                firstPaymentDate: getFirstPaymentDate().toISOString(),
              });

              Alert.alert(
                'Request Sent',
                'Your rent-to-own request has been sent. You\'ll be notified when the owner responds.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const adjustPayments = (delta) => {
    const minPayments = listing.rtoMinPayments || 1;
    const maxPayments = listing.rtoMaxPayments || 36;
    const newValue = Math.max(minPayments, Math.min(maxPayments, totalPayments + delta));
    setTotalPayments(newValue);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Item Summary */}
      <View style={styles.itemCard}>
        <Text style={styles.itemTitle}>{listing.title}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Purchase Price</Text>
          <Text style={styles.priceValue}>{formatCurrency(purchasePrice)}</Text>
        </View>
      </View>

      {/* Payment Terms */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Terms</Text>

        {/* Number of Payments */}
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Number of Payments</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustPayments(-1)}
            >
              <Ionicons name="remove" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{totalPayments}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => adjustPayments(1)}
            >
              <Ionicons name="add" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Frequency */}
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Payment Frequency</Text>
        </View>
        <View style={styles.frequencyOptions}>
          {PAYMENT_FREQUENCIES.map((freq) => (
            <TouchableOpacity
              key={freq.value}
              style={[
                styles.frequencyOption,
                paymentFrequency === freq.value && styles.frequencyOptionActive,
              ]}
              onPress={() => setPaymentFrequency(freq.value)}
            >
              <Text
                style={[
                  styles.frequencyOptionText,
                  paymentFrequency === freq.value && styles.frequencyOptionTextActive,
                ]}
              >
                {freq.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Payment Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Breakdown</Text>
        <View style={styles.breakdownCard}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Payment Amount</Text>
            <Text style={styles.breakdownValue}>{formatCurrency(paymentAmount)}</Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownDetail}>
              <Ionicons name="arrow-up-circle-outline" size={16} color={COLORS.primary} />
              <Text style={styles.breakdownDetailLabel}>Equity ({rentalCreditPercent}%)</Text>
            </View>
            <Text style={styles.breakdownDetailValue}>{formatCurrency(equityPerPayment)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownDetail}>
              <Ionicons name="home-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.breakdownDetailLabel}>Rental</Text>
            </View>
            <Text style={styles.breakdownDetailValue}>{formatCurrency(rentalPerPayment)}</Text>
          </View>
        </View>
      </View>

      {/* Schedule Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <View style={styles.scheduleCard}>
          <View style={styles.scheduleRow}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.textSecondary} />
            <View style={styles.scheduleInfo}>
              <Text style={styles.scheduleLabel}>First Payment</Text>
              <Text style={styles.scheduleValue}>{formatDate(getFirstPaymentDate())}</Text>
            </View>
          </View>
          <View style={styles.scheduleRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.primary} />
            <View style={styles.scheduleInfo}>
              <Text style={styles.scheduleLabel}>Ownership Transfer</Text>
              <Text style={styles.scheduleValue}>After {totalPayments} payments</Text>
            </View>
          </View>
          <View style={styles.scheduleRow}>
            <Ionicons name="cash-outline" size={20} color={COLORS.textSecondary} />
            <View style={styles.scheduleInfo}>
              <Text style={styles.scheduleLabel}>Total to Pay</Text>
              <Text style={styles.scheduleValue}>{formatCurrency(paymentAmount * totalPayments)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* How it Works */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>How Rent-to-Own Works</Text>
          <Text style={styles.infoText}>
            Each payment includes both a rental fee and equity toward ownership.
            After all payments, the item is transferred to you. You can use the item
            while paying it off.
          </Text>
        </View>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Request Rent-to-Own</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
  },
  itemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 14,
    color: COLORS.text,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  stepperButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 40,
    textAlign: 'center',
  },
  frequencyOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  frequencyOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  frequencyOptionActive: {
    backgroundColor: COLORS.primary,
  },
  frequencyOptionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  frequencyOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  breakdownCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  breakdownValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: COLORS.gray[800],
    marginVertical: 12,
  },
  breakdownDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownDetailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  breakdownDetailValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  scheduleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  scheduleValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 200, 5, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
