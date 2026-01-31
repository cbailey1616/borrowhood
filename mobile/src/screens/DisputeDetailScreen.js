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
  TextInput,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, CONDITION_LABELS } from '../utils/config';

export default function DisputeDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [dispute, setDispute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Resolution form state (for organizers)
  const [outcome, setOutcome] = useState('split');
  const [lenderPercent, setLenderPercent] = useState('50');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchDispute();
  }, [id]);

  const fetchDispute = async () => {
    try {
      const data = await api.getDispute(id);
      setDispute(data);
    } catch (error) {
      console.error('Failed to fetch dispute:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    if (notes.length < 10) {
      Alert.alert('Error', 'Please provide resolution notes (at least 10 characters)');
      return;
    }

    Alert.alert(
      'Confirm Resolution',
      `Are you sure you want to resolve this dispute? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.resolveDispute(id, outcome, parseFloat(lenderPercent), notes);
              fetchDispute();
              Alert.alert('Success', 'Dispute has been resolved');
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!dispute) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Dispute not found</Text>
      </View>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return COLORS.warning;
      case 'resolved_lender':
      case 'resolved_borrower':
      case 'resolved_split': return COLORS.secondary;
      default: return COLORS.gray[500];
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'open': return 'Open';
      case 'resolved_lender': return 'Resolved - Lender';
      case 'resolved_borrower': return 'Resolved - Borrower';
      case 'resolved_split': return 'Resolved - Split';
      default: return status;
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Status */}
      <View style={styles.statusCard}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(dispute.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(dispute.status) }]}>
            {getStatusLabel(dispute.status)}
          </Text>
        </View>
      </View>

      {/* Item */}
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => navigation.navigate('ListingDetail', { id: dispute.listing.id })}
      >
        <Image
          source={{ uri: dispute.listing.photos?.[0] || 'https://via.placeholder.com/60' }}
          style={styles.itemImage}
        />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{dispute.listing.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
      </TouchableOpacity>

      {/* Parties */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Parties Involved</Text>
        <View style={styles.partiesRow}>
          <TouchableOpacity
            style={styles.partyCard}
            onPress={() => navigation.navigate('UserProfile', { id: dispute.lender.id })}
          >
            <Image
              source={{ uri: dispute.lender.profilePhotoUrl || 'https://via.placeholder.com/40' }}
              style={styles.partyAvatar}
            />
            <Text style={styles.partyRole}>Lender</Text>
            <Text style={styles.partyName}>{dispute.lender.firstName}</Text>
          </TouchableOpacity>

          <Ionicons name="swap-horizontal" size={24} color={COLORS.gray[300]} />

          <TouchableOpacity
            style={styles.partyCard}
            onPress={() => navigation.navigate('UserProfile', { id: dispute.borrower.id })}
          >
            <Image
              source={{ uri: dispute.borrower.profilePhotoUrl || 'https://via.placeholder.com/40' }}
              style={styles.partyAvatar}
            />
            <Text style={styles.partyRole}>Borrower</Text>
            <Text style={styles.partyName}>{dispute.borrower.firstName}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Reason */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dispute Reason</Text>
        <Text style={styles.reasonText}>{dispute.reason}</Text>
      </View>

      {/* Condition */}
      {dispute.transaction && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Condition Change</Text>
          <View style={styles.conditionRow}>
            <View style={styles.conditionItem}>
              <Text style={styles.conditionLabel}>At Pickup</Text>
              <Text style={styles.conditionValue}>
                {CONDITION_LABELS[dispute.transaction.conditionAtPickup]}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={COLORS.danger} />
            <View style={styles.conditionItem}>
              <Text style={styles.conditionLabel}>At Return</Text>
              <Text style={[styles.conditionValue, { color: COLORS.danger }]}>
                {CONDITION_LABELS[dispute.transaction.conditionAtReturn]}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Evidence */}
      {dispute.evidenceUrls?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence ({dispute.evidenceUrls.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.evidenceRow}>
              {dispute.evidenceUrls.map((url, index) => (
                <Image
                  key={index}
                  source={{ uri: url }}
                  style={styles.evidenceImage}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Amounts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Amounts at Stake</Text>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Rental Fee</Text>
          <Text style={styles.amountValue}>${dispute.transaction?.rentalFee?.toFixed(2)}</Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Deposit</Text>
          <Text style={styles.amountValue}>${dispute.transaction?.depositAmount?.toFixed(2)}</Text>
        </View>
      </View>

      {/* Resolution (if resolved) */}
      {dispute.resolution && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resolution</Text>
          <View style={styles.resolutionCard}>
            <View style={styles.resolutionRow}>
              <Text style={styles.resolutionLabel}>To Lender</Text>
              <Text style={styles.resolutionValue}>${dispute.resolution.depositToLender?.toFixed(2)}</Text>
            </View>
            <View style={styles.resolutionRow}>
              <Text style={styles.resolutionLabel}>To Borrower</Text>
              <Text style={styles.resolutionValue}>${dispute.resolution.depositToBorrower?.toFixed(2)}</Text>
            </View>
            <View style={styles.resolutionRow}>
              <Text style={styles.resolutionLabel}>Organizer Fee</Text>
              <Text style={styles.resolutionValue}>${dispute.resolution.organizerFee?.toFixed(2)}</Text>
            </View>
            <Text style={styles.resolutionNotes}>{dispute.resolution.notes}</Text>
            <Text style={styles.resolvedBy}>
              Resolved by {dispute.resolution.resolvedBy} on{' '}
              {new Date(dispute.resolution.resolvedAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      )}

      {/* Resolution Form (for organizers) */}
      {dispute.isOrganizer && dispute.status === 'open' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resolve Dispute</Text>

          <Text style={styles.formLabel}>Outcome</Text>
          <View style={styles.outcomeOptions}>
            {[
              { key: 'lender', label: 'Full to Lender' },
              { key: 'split', label: 'Split' },
              { key: 'borrower', label: 'Full to Borrower' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.outcomeOption, outcome === opt.key && styles.outcomeOptionActive]}
                onPress={() => setOutcome(opt.key)}
              >
                <Text style={[styles.outcomeText, outcome === opt.key && styles.outcomeTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {outcome === 'split' && (
            <>
              <Text style={styles.formLabel}>Lender Percentage: {lenderPercent}%</Text>
              <TextInput
                style={styles.input}
                value={lenderPercent}
                onChangeText={setLenderPercent}
                keyboardType="number-pad"
                maxLength={3}
              />
            </>
          )}

          <Text style={styles.formLabel}>Resolution Notes *</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Explain your decision..."
            multiline
            numberOfLines={4}
            maxLength={1000}
          />

          <TouchableOpacity
            style={[styles.resolveButton, actionLoading && styles.resolveButtonDisabled]}
            onPress={handleResolve}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.resolveButtonText}>Resolve Dispute</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: COLORS.gray[500],
  },
  statusCard: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
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
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 1,
    gap: 12,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: COLORS.gray[200],
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginBottom: 12,
  },
  partiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  partyCard: {
    alignItems: 'center',
  },
  partyAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray[200],
  },
  partyRole: {
    fontSize: 11,
    color: COLORS.gray[500],
    marginTop: 8,
  },
  partyName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  reasonText: {
    fontSize: 14,
    color: COLORS.gray[600],
    lineHeight: 20,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  conditionItem: {
    alignItems: 'center',
  },
  conditionLabel: {
    fontSize: 12,
    color: COLORS.gray[500],
  },
  conditionValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[900],
    marginTop: 4,
  },
  evidenceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  evidenceImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: COLORS.gray[200],
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  amountLabel: {
    fontSize: 14,
    color: COLORS.gray[600],
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray[900],
  },
  resolutionCard: {
    backgroundColor: COLORS.gray[50],
    borderRadius: 12,
    padding: 16,
  },
  resolutionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resolutionLabel: {
    fontSize: 14,
    color: COLORS.gray[600],
  },
  resolutionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  resolutionNotes: {
    fontSize: 13,
    color: COLORS.gray[600],
    marginTop: 12,
    fontStyle: 'italic',
  },
  resolvedBy: {
    fontSize: 12,
    color: COLORS.gray[400],
    marginTop: 8,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.gray[700],
    marginBottom: 8,
    marginTop: 12,
  },
  outcomeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  outcomeOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.gray[100],
    alignItems: 'center',
  },
  outcomeOptionActive: {
    backgroundColor: COLORS.primary,
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.gray[600],
  },
  outcomeTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: COLORS.gray[50],
  },
  notesInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  resolveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  resolveButtonDisabled: {
    opacity: 0.7,
  },
  resolveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
