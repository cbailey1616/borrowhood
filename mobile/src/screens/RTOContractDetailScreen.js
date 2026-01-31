import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS } from '../utils/config';

const STATUS_COLORS = {
  pending: COLORS.warning,
  active: COLORS.primary,
  completed: COLORS.primary,
  defaulted: COLORS.danger,
  cancelled: COLORS.gray[500],
};

const STATUS_LABELS = {
  pending: 'Pending Approval',
  active: 'Active',
  completed: 'Completed',
  defaulted: 'Defaulted',
  cancelled: 'Cancelled',
};

export default function RTOContractDetailScreen({ navigation, route }) {
  const { contractId } = route.params;
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadContract = async () => {
    try {
      const data = await api.getRTOContract(contractId);
      setContract(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load contract');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadContract();
  }, [contractId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadContract();
  }, []);

  const handleApprove = () => {
    Alert.alert(
      'Approve Contract',
      'Are you sure you want to approve this rent-to-own contract? The borrower will begin making payments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.approveRTOContract(contractId);
              loadContract();
              Alert.alert('Success', 'Contract approved successfully');
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDecline = () => {
    Alert.prompt(
      'Decline Contract',
      'Provide a reason for declining (optional):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async (reason) => {
            setActionLoading(true);
            try {
              await api.declineRTOContract(contractId, reason);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleMakePayment = () => {
    const nextPayment = contract.payments.find(p => p.status === 'pending');
    if (!nextPayment) return;

    Alert.alert(
      'Make Payment',
      `Pay $${nextPayment.totalAmount.toFixed(2)} for payment #${nextPayment.paymentNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.makeRTOPayment(contractId);
              loadContract();
              Alert.alert('Success', 'Payment processed successfully');
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    Alert.prompt(
      'Cancel Contract',
      'Are you sure? Please provide a reason:',
      [
        { text: 'Keep Contract', style: 'cancel' },
        {
          text: 'Cancel Contract',
          style: 'destructive',
          onPress: async (reason) => {
            if (!reason?.trim()) {
              Alert.alert('Error', 'Please provide a reason');
              return;
            }
            setActionLoading(true);
            try {
              await api.cancelRTOContract(contractId, reason);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const formatCurrency = (amount) => `$${amount.toFixed(2)}`;
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Contract not found</Text>
      </View>
    );
  }

  const nextPayment = contract.payments.find(p => p.status === 'pending');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      {/* Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: STATUS_COLORS[contract.status] + '20' }]}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[contract.status] }]} />
        <Text style={[styles.statusText, { color: STATUS_COLORS[contract.status] }]}>
          {STATUS_LABELS[contract.status]}
        </Text>
      </View>

      {/* Item Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Item</Text>
        <TouchableOpacity
          style={styles.itemCard}
          onPress={() => navigation.navigate('ListingDetail', { listingId: contract.listing.id })}
        >
          <Text style={styles.itemTitle}>{contract.listing.title}</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Progress */}
      {contract.status === 'active' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.progressCard}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${contract.progressPercent}%` }]}
              />
            </View>
            <View style={styles.progressStats}>
              <View style={styles.progressStat}>
                <Text style={styles.progressValue}>
                  {formatCurrency(contract.equityAccumulated)}
                </Text>
                <Text style={styles.progressLabel}>Equity Built</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={styles.progressValue}>
                  {formatCurrency(contract.remainingEquity)}
                </Text>
                <Text style={styles.progressLabel}>Remaining</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={styles.progressValue}>
                  {contract.paymentsCompleted}/{contract.totalPayments}
                </Text>
                <Text style={styles.progressLabel}>Payments</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Next Payment */}
      {contract.status === 'active' && nextPayment && contract.isBorrower && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Payment</Text>
          <View style={styles.paymentCard}>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentAmount}>{formatCurrency(nextPayment.totalAmount)}</Text>
              <Text style={styles.paymentDue}>Due {formatDate(nextPayment.dueDate)}</Text>
            </View>
            <TouchableOpacity
              style={styles.payButton}
              onPress={handleMakePayment}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.payButtonText}>Pay Now</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Contract Terms */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contract Terms</Text>
        <View style={styles.termsCard}>
          <View style={styles.termRow}>
            <Text style={styles.termLabel}>Purchase Price</Text>
            <Text style={styles.termValue}>{formatCurrency(contract.purchasePrice)}</Text>
          </View>
          <View style={styles.termRow}>
            <Text style={styles.termLabel}>Payment Amount</Text>
            <Text style={styles.termValue}>{formatCurrency(contract.paymentAmount)}</Text>
          </View>
          <View style={styles.termRow}>
            <Text style={styles.termLabel}>Payment Schedule</Text>
            <Text style={styles.termValue}>
              {contract.totalPayments} {contract.paymentFrequency} payments
            </Text>
          </View>
          <View style={styles.termRow}>
            <Text style={styles.termLabel}>Equity per Payment</Text>
            <Text style={styles.termValue}>{contract.rentalCreditPercent}%</Text>
          </View>
        </View>
      </View>

      {/* Parties */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {contract.isBorrower ? 'Owner' : 'Buyer'}
        </Text>
        <TouchableOpacity
          style={styles.partyCard}
          onPress={() => navigation.navigate('UserProfile', {
            userId: contract.isBorrower ? contract.lender.id : contract.borrower.id
          })}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(contract.isBorrower ? contract.lender : contract.borrower).firstName[0]}
            </Text>
          </View>
          <View style={styles.partyInfo}>
            <Text style={styles.partyName}>
              {(contract.isBorrower ? contract.lender : contract.borrower).firstName}{' '}
              {(contract.isBorrower ? contract.lender : contract.borrower).lastName}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Payment History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment History</Text>
        {contract.payments.map((payment) => (
          <View key={payment.id} style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <View
                style={[
                  styles.historyIcon,
                  payment.status === 'completed' && styles.historyIconComplete,
                ]}
              >
                <Ionicons
                  name={payment.status === 'completed' ? 'checkmark' : 'time-outline'}
                  size={16}
                  color={payment.status === 'completed' ? '#fff' : COLORS.textSecondary}
                />
              </View>
              <View>
                <Text style={styles.historyLabel}>Payment #{payment.paymentNumber}</Text>
                <Text style={styles.historyDate}>
                  {payment.paidAt ? `Paid ${formatDate(payment.paidAt)}` : `Due ${formatDate(payment.dueDate)}`}
                </Text>
              </View>
            </View>
            <Text style={[
              styles.historyAmount,
              payment.status === 'completed' && styles.historyAmountComplete,
            ]}>
              {formatCurrency(payment.totalAmount)}
            </Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      {contract.status === 'pending' && contract.isLender && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={handleDecline}
            disabled={actionLoading}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.approveButton}
            onPress={handleApprove}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.approveButtonText}>Approve</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {contract.status === 'active' && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={actionLoading}
        >
          <Text style={styles.cancelButtonText}>Cancel Contract</Text>
        </TouchableOpacity>
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.gray[800],
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStat: {
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  progressLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  paymentInfo: {},
  paymentAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  paymentDue: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  payButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  termsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  termRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  termLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  termValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  partyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  partyInfo: {
    flex: 1,
  },
  partyName: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray[800],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyIconComplete: {
    backgroundColor: COLORS.primary,
  },
  historyLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
  historyDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  historyAmount: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  historyAmountComplete: {
    color: COLORS.text,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 32,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    alignItems: 'center',
  },
  declineButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  approveButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  cancelButtonText: {
    color: COLORS.danger,
    fontSize: 14,
  },
});
