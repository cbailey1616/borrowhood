import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, TRANSACTION_STATUS_LABELS, CONDITION_LABELS } from '../utils/config';

export default function TransactionDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { user } = useAuth();
  const [transaction, setTransaction] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchTransaction();
  }, [id]);

  const fetchTransaction = async () => {
    try {
      const data = await api.getTransaction(id);
      setTransaction(data);
    } catch (error) {
      console.error('Failed to fetch transaction:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await api.approveTransaction(id);
      fetchTransaction();
      Alert.alert('Approved', 'The borrower will be notified to complete payment.');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = () => {
    Alert.prompt(
      'Decline Request',
      'Optionally provide a reason:',
      async (reason) => {
        setActionLoading(true);
        try {
          await api.declineTransaction(id, reason);
          navigation.goBack();
        } catch (error) {
          Alert.alert('Error', error.message);
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const handleConfirmPickup = () => {
    Alert.alert(
      'Confirm Pickup',
      'Confirm that the item has been picked up?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.confirmPickup(id);
              fetchTransaction();
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

  const handleConfirmReturn = () => {
    Alert.alert(
      'Confirm Return',
      'What condition is the item in?',
      [
        { text: 'Cancel', style: 'cancel' },
        ...['like_new', 'good', 'fair', 'worn'].map(condition => ({
          text: CONDITION_LABELS[condition],
          onPress: async () => {
            setActionLoading(true);
            try {
              const result = await api.confirmReturn(id, condition);
              fetchTransaction();
              if (result.disputed) {
                Alert.alert('Dispute Opened', 'A dispute has been opened due to condition change.');
              }
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        })),
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Transaction not found</Text>
      </View>
    );
  }

  const otherPerson = transaction.isBorrower ? transaction.lender : transaction.borrower;
  const roleLabel = transaction.isBorrower ? 'Lender' : 'Borrower';

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return COLORS.warning;
      case 'approved':
      case 'paid': return COLORS.primary;
      case 'picked_up': return COLORS.secondary;
      case 'completed':
      case 'returned': return COLORS.secondary;
      case 'cancelled':
      case 'disputed': return COLORS.danger;
      default: return COLORS.gray[500];
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        {/* Item Info */}
        <TouchableOpacity
          style={styles.listingCard}
          onPress={() => navigation.navigate('ListingDetail', { id: transaction.listing.id })}
        >
          <Image
            source={{ uri: transaction.listing.photos?.[0] || 'https://via.placeholder.com/80' }}
            style={styles.listingImage}
          />
          <View style={styles.listingInfo}>
            <Text style={styles.listingTitle}>{transaction.listing.title}</Text>
            <Text style={styles.listingCondition}>
              {CONDITION_LABELS[transaction.listing.condition]}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
        </TouchableOpacity>

        {/* Status */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(transaction.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(transaction.status) }]}>
              {TRANSACTION_STATUS_LABELS[transaction.status]}
            </Text>
          </View>
        </View>

        {/* Other Person */}
        <TouchableOpacity
          style={styles.personCard}
          onPress={() => navigation.navigate('UserProfile', { id: otherPerson.id })}
        >
          <Image
            source={{ uri: otherPerson.profilePhotoUrl || 'https://via.placeholder.com/48' }}
            style={styles.personAvatar}
          />
          <View style={styles.personInfo}>
            <Text style={styles.personRole}>{roleLabel}</Text>
            <Text style={styles.personName}>
              {otherPerson.firstName} {otherPerson.lastName}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
        </TouchableOpacity>

        {/* Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rental Period</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>Start</Text>
              <Text style={styles.dateValue}>
                {new Date(transaction.startDate).toLocaleDateString()}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={COLORS.gray[300]} />
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>End</Text>
              <Text style={styles.dateValue}>
                {new Date(transaction.endDate).toLocaleDateString()}
              </Text>
            </View>
          </View>
          <Text style={styles.daysText}>{transaction.rentalDays} days</Text>
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.priceBreakdown}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>
                Rental fee ({transaction.rentalDays} days x ${transaction.dailyRate})
              </Text>
              <Text style={styles.priceValue}>${transaction.rentalFee.toFixed(2)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Refundable deposit</Text>
              <Text style={styles.priceValue}>${transaction.depositAmount.toFixed(2)}</Text>
            </View>
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                ${(transaction.rentalFee + transaction.depositAmount).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Messages */}
        {transaction.borrowerMessage && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Message from Borrower</Text>
            <Text style={styles.messageText}>{transaction.borrowerMessage}</Text>
          </View>
        )}

        {transaction.lenderResponse && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Response from Lender</Text>
            <Text style={styles.messageText}>{transaction.lenderResponse}</Text>
          </View>
        )}
      </ScrollView>

      {/* Actions */}
      {transaction.isLender && transaction.status === 'pending' && (
        <View style={styles.footer}>
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

      {transaction.isLender && transaction.status === 'paid' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.approveButton}
            onPress={handleConfirmPickup}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Confirm Pickup</Text>
          </TouchableOpacity>
        </View>
      )}

      {transaction.isLender && transaction.status === 'picked_up' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.approveButton}
            onPress={handleConfirmReturn}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Confirm Return</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    gap: 12,
  },
  listingImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: COLORS.gray[200],
  },
  listingInfo: {
    flex: 1,
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  listingCondition: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusCard: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.surface,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray[200],
  },
  personInfo: {
    flex: 1,
  },
  personRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  personName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  section: {
    backgroundColor: COLORS.surface,
    padding: 16,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  dateItem: {
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 4,
  },
  daysText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  priceBreakdown: {
    gap: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  priceValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  messageText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  approveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
