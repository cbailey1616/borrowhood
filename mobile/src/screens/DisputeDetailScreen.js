import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

export default function DisputeDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [dispute, setDispute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Resolution form state (for organizers)
  const [outcome, setOutcome] = useState('split');
  const [lenderPercent, setLenderPercent] = useState('50');
  const [notes, setNotes] = useState('');

  const [showResolveSheet, setShowResolveSheet] = useState(false);
  const [validationError, setValidationError] = useState(null);

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
      setValidationError('Please provide resolution notes (at least 10 characters)');
      haptics.warning();
      return;
    }
    setValidationError(null);
    setShowResolveSheet(true);
  };

  const performResolve = async () => {
    setActionLoading(true);
    try {
      await api.resolveDispute(id, outcome, parseFloat(lenderPercent), notes);
      haptics.success();
      fetchDispute();
    } catch (error) {
      haptics.error();
    } finally {
      setActionLoading(false);
    }
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
      <HapticPressable
        style={styles.itemCard}
        onPress={() => navigation.navigate('ListingDetail', { id: dispute.listing.id })}
        haptic="light"
      >
        <Image
          source={{ uri: dispute.listing.photos?.[0] || 'https://via.placeholder.com/60' }}
          style={styles.itemImage}
        />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{dispute.listing.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
      </HapticPressable>

      {/* Parties */}
      <BlurCard style={styles.section}>
        <View style={styles.sectionContent}>
          <Text style={styles.sectionTitle}>Parties Involved</Text>
          <View style={styles.partiesRow}>
            <HapticPressable
              style={styles.partyCard}
              onPress={() => navigation.navigate('UserProfile', { id: dispute.lender.id })}
              haptic="light"
            >
              <Image
                source={{ uri: dispute.lender.profilePhotoUrl || 'https://via.placeholder.com/40' }}
                style={styles.partyAvatar}
              />
              <Text style={styles.partyRole}>Lender</Text>
              <Text style={styles.partyName}>{dispute.lender.firstName}</Text>
            </HapticPressable>

            <Ionicons name="swap-horizontal" size={24} color={COLORS.gray[300]} />

            <HapticPressable
              style={styles.partyCard}
              onPress={() => navigation.navigate('UserProfile', { id: dispute.borrower.id })}
              haptic="light"
            >
              <Image
                source={{ uri: dispute.borrower.profilePhotoUrl || 'https://via.placeholder.com/40' }}
                style={styles.partyAvatar}
              />
              <Text style={styles.partyRole}>Borrower</Text>
              <Text style={styles.partyName}>{dispute.borrower.firstName}</Text>
            </HapticPressable>
          </View>
        </View>
      </BlurCard>

      {/* Reason */}
      <BlurCard style={styles.section}>
        <View style={styles.sectionContent}>
          <Text style={styles.sectionTitle}>Dispute Reason</Text>
          <Text style={styles.reasonText}>{dispute.reason}</Text>
        </View>
      </BlurCard>

      {/* Condition */}
      {dispute.transaction && (
        <BlurCard style={styles.section}>
          <View style={styles.sectionContent}>
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
        </BlurCard>
      )}

      {/* Evidence */}
      {dispute.evidenceUrls?.length > 0 && (
        <BlurCard style={styles.section}>
          <View style={styles.sectionContent}>
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
        </BlurCard>
      )}

      {/* Amounts */}
      <BlurCard style={styles.section}>
        <View style={styles.sectionContent}>
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
      </BlurCard>

      {/* Resolution (if resolved) */}
      {dispute.resolution && (
        <BlurCard style={styles.section}>
          <View style={styles.sectionContent}>
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
        </BlurCard>
      )}

      {/* Resolution Form (for organizers) */}
      {dispute.isOrganizer && dispute.status === 'open' && (
        <BlurCard style={styles.section}>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>Resolve Dispute</Text>

            <Text style={styles.formLabel}>Outcome</Text>
            <View style={styles.outcomeOptions}>
              {[
                { key: 'lender', label: 'Full to Lender' },
                { key: 'split', label: 'Split' },
                { key: 'borrower', label: 'Full to Borrower' },
              ].map(opt => (
                <HapticPressable
                  key={opt.key}
                  style={[styles.outcomeOption, outcome === opt.key && styles.outcomeOptionActive]}
                  onPress={() => setOutcome(opt.key)}
                  haptic="light"
                >
                  <Text style={[styles.outcomeText, outcome === opt.key && styles.outcomeTextActive]}>
                    {opt.label}
                  </Text>
                </HapticPressable>
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
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              maxLength={1000}
            />

            {validationError && (
              <Text style={styles.validationError}>{validationError}</Text>
            )}

            <HapticPressable
              style={[styles.resolveButton, actionLoading && styles.resolveButtonDisabled]}
              onPress={handleResolve}
              disabled={actionLoading}
              haptic="medium"
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.resolveButtonText}>Resolve Dispute</Text>
              )}
            </HapticPressable>
          </View>
        </BlurCard>
      )}

      <ActionSheet
        isVisible={showResolveSheet}
        onClose={() => setShowResolveSheet(false)}
        title="Confirm Resolution"
        message="Are you sure you want to resolve this dispute? This action cannot be undone."
        actions={[
          {
            label: 'Resolve',
            onPress: performResolve,
          },
        ]}
      />
    </ScrollView>
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  statusCard: {
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  statusBadge: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  statusText: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    fontWeight: '600',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    marginTop: 1,
    gap: SPACING.md,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[700],
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  section: {
    marginTop: SPACING.md,
  },
  sectionContent: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
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
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  partyRole: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  partyName: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
  },
  reasonText: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
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
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  conditionValue: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  evidenceRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  evidenceImage: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[700],
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  amountLabel: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  amountValue: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  resolutionCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  resolutionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  resolutionLabel: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resolutionValue: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  resolutionNotes: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },
  resolvedBy: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  formLabel: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  outcomeOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  outcomeOption: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
  },
  outcomeOptionActive: {
    backgroundColor: COLORS.primary,
  },
  outcomeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  outcomeTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md - 2,
    ...TYPOGRAPHY.body,
    fontSize: 16,
    backgroundColor: COLORS.surfaceElevated,
    color: COLORS.text,
  },
  notesInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  validationError: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.danger,
    marginTop: SPACING.sm,
  },
  resolveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xxl,
  },
  resolveButtonDisabled: {
    opacity: 0.7,
  },
  resolveButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
});
