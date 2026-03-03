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
import { useAuth } from '../context/AuthContext';
import { COLORS, CONDITION_LABELS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';

const TYPE_CONFIG = {
  damagesClaim: { label: 'Damages Claim', icon: 'construct-outline' },
  nonReturn: { label: 'Non-Return', icon: 'close-circle-outline' },
  lateReturn: { label: 'Late Return', icon: 'time-outline' },
  itemNotAsDescribed: { label: 'Not As Described', icon: 'alert-circle-outline' },
  paymentIssue: { label: 'Payment Issue', icon: 'card-outline' },
  noShow: { label: 'No Show', icon: 'person-remove-outline' },
};

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: COLORS.warning },
  awaitingResponse: { label: 'Awaiting Response', color: COLORS.warning },
  underReview: { label: 'Under Review', color: COLORS.primary },
  resolvedInFavorOfClaimant: { label: 'Resolved - Claimant', color: COLORS.secondary },
  resolvedInFavorOfRespondent: { label: 'Resolved - Respondent', color: COLORS.secondary },
  dismissed: { label: 'Dismissed', color: COLORS.textMuted },
  expired: { label: 'Expired - Manual Follow-up', color: COLORS.danger },
};

const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

const timeAgo = (date) => {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function DisputeDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { user } = useAuth();
  const [dispute, setDispute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Resolution form state
  const [outcome, setOutcome] = useState('claimant');
  const [resolvedAmountText, setResolvedAmountText] = useState('');
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
      if (data.requestedAmount) {
        setResolvedAmountText(data.requestedAmount.toString());
      }
    } catch (error) {
      console.error('Failed to fetch dispute:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = () => {
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
      const resolvedAmount = outcome === 'claimant'
        ? Math.min(parseFloat(resolvedAmountText) || 0, dispute.transaction?.depositAmount || 0)
        : undefined;
      await api.resolveDispute(id, { outcome, resolvedAmount, notes });
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
        <Text style={styles.emptyText}>Dispute not found</Text>
      </View>
    );
  }

  const statusConfig = STATUS_CONFIG[dispute.status] || { label: dispute.status, color: COLORS.textMuted };
  const typeConfig = TYPE_CONFIG[dispute.type] || { label: dispute.type, icon: 'help-circle-outline' };
  const canResolve = (dispute.isOrganizer || dispute.isAdmin) &&
    ['awaitingResponse', 'underReview'].includes(dispute.status);
  const canRespond = dispute.isRespondent && dispute.status === 'awaitingResponse' && !dispute.response;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Status + Type header */}
      <View style={styles.header}>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
        <View style={styles.typeBadge}>
          <Ionicons name={typeConfig.icon} size={14} color={COLORS.textSecondary} />
          <Text style={styles.typeText}>{typeConfig.label}</Text>
        </View>
      </View>

      {/* Item link */}
      <HapticPressable
        style={styles.itemCard}
        onPress={() => navigation.navigate('ListingDetail', { id: dispute.listing?.id })}
        haptic="light"
      >
        <Image
          source={{ uri: dispute.listing?.photos?.[0] || 'https://via.placeholder.com/60' }}
          style={styles.itemImage}
        />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{dispute.listing?.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </HapticPressable>

      {/* Expired hold warning */}
      {dispute.holdExpired && (
        <BlurCard style={styles.section}>
          <View style={[styles.sectionContent, styles.warningBanner]}>
            <Ionicons name="warning-outline" size={20} color={COLORS.danger} />
            <Text style={styles.warningText}>
              The authorization hold has expired. Manual follow-up is required to process this payment.
            </Text>
          </View>
        </BlurCard>
      )}

      {/* === TIMELINE === */}

      {/* Timeline Node 1: Filed */}
      <View style={styles.timelineNode}>
        <View style={styles.timelineDot}>
          <Ionicons name="flag" size={14} color={COLORS.primary} />
        </View>
        <View style={styles.timelineConnector} />
        <BlurCard style={styles.timelineCard}>
          <View style={styles.sectionContent}>
            <View style={styles.timelineHeader}>
              <Text style={styles.timelineLabel}>Claim Filed</Text>
              <Text style={styles.timelineDate}>{timeAgo(dispute.createdAt)}</Text>
            </View>

            {/* Claimant info */}
            {dispute.claimant && (
              <HapticPressable
                style={styles.personRow}
                onPress={() => navigation.navigate('UserProfile', { id: dispute.claimant.id })}
                haptic="light"
              >
                <Image
                  source={{ uri: dispute.claimant.profilePhotoUrl || 'https://via.placeholder.com/32' }}
                  style={styles.avatar}
                />
                <Text style={styles.personName}>
                  {dispute.claimant.firstName} {dispute.claimant.lastName}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </HapticPressable>
            )}

            <Text style={styles.descriptionText}>{dispute.description}</Text>

            {/* Claim photos */}
            {dispute.photoUrls?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                <View style={styles.photosRow}>
                  {dispute.photoUrls.map((url, i) => (
                    <Image key={i} source={{ uri: url }} style={styles.evidenceImage} />
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Requested amount */}
            {dispute.requestedAmount != null && (
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Requested</Text>
                <Text style={styles.amountValue}>{formatCurrency(dispute.requestedAmount)}</Text>
              </View>
            )}
          </View>
        </BlurCard>
      </View>

      {/* Timeline Node 2: Response */}
      {dispute.response ? (
        <View style={styles.timelineNode}>
          <View style={styles.timelineDot}>
            <Ionicons name="chatbubble" size={14} color={COLORS.secondary} />
          </View>
          <View style={styles.timelineConnector} />
          <BlurCard style={styles.timelineCard}>
            <View style={styles.sectionContent}>
              <View style={styles.timelineHeader}>
                <Text style={styles.timelineLabel}>Response</Text>
                <Text style={styles.timelineDate}>{timeAgo(dispute.response.respondedAt)}</Text>
              </View>

              {dispute.respondent && (
                <HapticPressable
                  style={styles.personRow}
                  onPress={() => navigation.navigate('UserProfile', { id: dispute.respondent.id })}
                  haptic="light"
                >
                  <Image
                    source={{ uri: dispute.respondent.profilePhotoUrl || 'https://via.placeholder.com/32' }}
                    style={styles.avatar}
                  />
                  <Text style={styles.personName}>
                    {dispute.respondent.firstName} {dispute.respondent.lastName}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </HapticPressable>
              )}

              <Text style={styles.descriptionText}>{dispute.response.description}</Text>

              {dispute.response.photoUrls?.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                  <View style={styles.photosRow}>
                    {dispute.response.photoUrls.map((url, i) => (
                      <Image key={i} source={{ uri: url }} style={styles.evidenceImage} />
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </BlurCard>
        </View>
      ) : dispute.status === 'awaitingResponse' && (
        <View style={styles.timelineNode}>
          <View style={[styles.timelineDot, styles.timelineDotPending]}>
            <Ionicons name="hourglass" size={14} color={COLORS.textMuted} />
          </View>
          <View style={styles.timelineConnector} />
          <BlurCard style={[styles.timelineCard, styles.pendingCard]}>
            <View style={styles.sectionContent}>
              <Text style={styles.pendingText}>Awaiting response from respondent...</Text>
            </View>
          </BlurCard>
        </View>
      )}

      {/* Timeline Node 3: Resolution */}
      {dispute.resolution && (
        <View style={styles.timelineNode}>
          <View style={styles.timelineDot}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.secondary} />
          </View>
          <BlurCard style={styles.timelineCard}>
            <View style={styles.sectionContent}>
              <View style={styles.timelineHeader}>
                <Text style={styles.timelineLabel}>Resolution</Text>
                <Text style={styles.timelineDate}>
                  {new Date(dispute.resolution.resolvedAt).toLocaleDateString()}
                </Text>
              </View>

              {dispute.resolution.resolvedAmount != null && (
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Resolved Amount</Text>
                  <Text style={[styles.amountValue, { color: COLORS.secondary }]}>
                    {formatCurrency(dispute.resolution.resolvedAmount)}
                  </Text>
                </View>
              )}

              {dispute.resolution.notes && (
                <Text style={styles.resolutionNotes}>{dispute.resolution.notes}</Text>
              )}

              {dispute.resolution.resolvedBy && (
                <Text style={styles.resolvedBy}>
                  Resolved by {dispute.resolution.resolvedBy}
                </Text>
              )}
            </View>
          </BlurCard>
        </View>
      )}

      {/* Amounts at stake */}
      <BlurCard style={styles.section}>
        <View style={styles.sectionContent}>
          <Text style={styles.sectionTitle}>Transaction Details</Text>
          {dispute.transaction && (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Rental Fee</Text>
                <Text style={styles.detailValue}>{formatCurrency(dispute.transaction.rentalFee)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Security Deposit</Text>
                <Text style={styles.detailValue}>{formatCurrency(dispute.transaction.depositAmount)}</Text>
              </View>
              {dispute.transaction.conditionAtPickup && dispute.transaction.conditionAtReturn && (
                <View style={styles.conditionRow}>
                  <View style={styles.conditionItem}>
                    <Text style={styles.conditionLabel}>Pickup</Text>
                    <Text style={styles.conditionValue}>
                      {CONDITION_LABELS[dispute.transaction.conditionAtPickup] || dispute.transaction.conditionAtPickup}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
                  <View style={styles.conditionItem}>
                    <Text style={styles.conditionLabel}>Return</Text>
                    <Text style={[styles.conditionValue, { color: COLORS.danger }]}>
                      {CONDITION_LABELS[dispute.transaction.conditionAtReturn] || dispute.transaction.conditionAtReturn}
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </BlurCard>

      {/* Respond button (for respondent) */}
      {canRespond && (
        <HapticPressable
          style={styles.respondButton}
          onPress={() => navigation.navigate('RespondToDispute', {
            disputeId: dispute.id,
            claimantName: dispute.claimant ? `${dispute.claimant.firstName} ${dispute.claimant.lastName}` : 'Claimant',
            type: dispute.type,
            description: dispute.description,
          })}
          haptic="medium"
        >
          <Ionicons name="chatbubble-outline" size={20} color="#fff" />
          <Text style={styles.respondButtonText}>Respond to Dispute</Text>
        </HapticPressable>
      )}

      {/* Waiting info (for claimant) */}
      {dispute.isClaimant && dispute.status === 'awaitingResponse' && (
        <BlurCard style={styles.section}>
          <View style={[styles.sectionContent, styles.infoRow]}>
            <Ionicons name="time-outline" size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>
              Waiting for the other party to respond. They have 48 hours from when the dispute was filed.
            </Text>
          </View>
        </BlurCard>
      )}

      {/* Resolution Form (for organizers/admins) */}
      {canResolve && (
        <BlurCard style={styles.section}>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>Resolve Dispute</Text>

            <Text style={styles.formLabel}>Outcome</Text>
            <View style={styles.outcomeOptions}>
              {[
                { key: 'claimant', label: 'Favor Claimant' },
                { key: 'respondent', label: 'Favor Respondent' },
                { key: 'dismissed', label: 'Dismiss' },
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

            {outcome === 'claimant' && (
              <>
                <Text style={styles.formLabel}>Amount to Capture from Deposit</Text>
                <View style={styles.amountInputRow}>
                  <Text style={styles.dollarSign}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={resolvedAmountText}
                    onChangeText={setResolvedAmountText}
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>
                <Text style={styles.formHint}>
                  Max: {formatCurrency(dispute.transaction?.depositAmount)} (deposit)
                </Text>
              </>
            )}

            <Text style={styles.formLabel}>Resolution Notes *</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Explain your decision..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />

            {validationError && (
              <Text style={styles.validationError}>{validationError}</Text>
            )}

            <HapticPressable
              style={[styles.resolveButton, actionLoading && styles.buttonDisabled]}
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
  scrollContent: {
    paddingBottom: SPACING.xxl,
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
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  statusBadge: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  statusText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  typeText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },

  // Item card
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    marginTop: 1,
    gap: SPACING.md,
  },
  itemImage: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray?.[700] || '#333',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },

  // Warning
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  warningText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.danger,
    flex: 1,
  },

  // Timeline
  timelineNode: {
    paddingLeft: SPACING.xl,
    paddingRight: SPACING.lg,
    marginTop: SPACING.md,
    position: 'relative',
  },
  timelineDot: {
    position: 'absolute',
    left: SPACING.sm,
    top: SPACING.lg + 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineDotPending: {
    opacity: 0.5,
  },
  timelineConnector: {
    position: 'absolute',
    left: SPACING.sm + 13,
    top: SPACING.lg + 30,
    bottom: -SPACING.md,
    width: 2,
    backgroundColor: COLORS.separator,
    zIndex: 1,
  },
  timelineCard: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  timelineLabel: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
  },
  timelineDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  pendingCard: {
    opacity: 0.6,
  },
  pendingText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // Person row
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray?.[700] || '#333',
  },
  personName: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },

  // Content
  descriptionText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  photosScroll: {
    marginTop: SPACING.sm,
  },
  photosRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  evidenceImage: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray?.[700] || '#333',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  amountLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  amountValue: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Resolution
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

  // Sections
  section: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.lg,
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  detailLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  detailValue: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: SPACING.md,
  },
  conditionItem: {
    alignItems: 'center',
  },
  conditionLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  conditionValue: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.xs,
  },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  infoText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.primary,
    flex: 1,
  },

  // Respond button
  respondButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  respondButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.button,
    fontSize: 16,
  },

  // Resolve form
  formLabel: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  formHint: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  outcomeOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  outcomeOption: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray?.[800] || '#1a1a1a',
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
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray?.[800] || '#1a1a1a',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
  },
  dollarSign: {
    ...TYPOGRAPHY.headline,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  amountInput: {
    flex: 1,
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    paddingVertical: SPACING.md,
  },
  notesInput: {
    backgroundColor: COLORS.gray?.[800] || '#1a1a1a',
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    minHeight: 100,
  },
  validationError: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.danger,
    marginTop: SPACING.sm,
  },
  resolveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resolveButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
});
