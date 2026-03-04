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
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
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
  counterPending: { label: 'Counter Offer', color: COLORS.warning },
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

  // Accept claim state
  const [showAcceptSheet, setShowAcceptSheet] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);

  // Counter response state (claimant accepts/declines counter)
  const [showAcceptCounterSheet, setShowAcceptCounterSheet] = useState(false);
  const [showDeclineCounterSheet, setShowDeclineCounterSheet] = useState(false);
  const [counterActionLoading, setCounterActionLoading] = useState(false);

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
        ? Math.min(parseFloat(resolvedAmountText) || 0, (dispute.transaction?.rentalFee || 0) + (dispute.transaction?.depositAmount || 0))
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

  const handleAcceptClaim = () => {
    setShowAcceptSheet(true);
  };

  const performAccept = async () => {
    setAcceptLoading(true);
    try {
      await api.acceptDispute(id);
      haptics.success();
      fetchDispute();
    } catch (error) {
      haptics.error();
    } finally {
      setAcceptLoading(false);
    }
  };

  const performAcceptCounter = async () => {
    setCounterActionLoading(true);
    try {
      await api.acceptCounter(id);
      haptics.success();
      fetchDispute();
    } catch (error) {
      haptics.error();
    } finally {
      setCounterActionLoading(false);
    }
  };

  const performDeclineCounter = async () => {
    setCounterActionLoading(true);
    try {
      await api.declineCounter(id);
      haptics.success();
      fetchDispute();
    } catch (error) {
      haptics.error();
    } finally {
      setCounterActionLoading(false);
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
    ['awaitingResponse', 'underReview', 'counterPending'].includes(dispute.status);
  const canRespond = dispute.isRespondent && dispute.status === 'awaitingResponse' && !dispute.response;
  const canRespondToCounter = dispute.isClaimant && dispute.status === 'counterPending' && dispute.response?.counterAmount != null;

  const personName = (person) => {
    if (!person) return 'Unknown';
    if (person.id === user?.id) return 'You';
    return person.firstName;
  };

  const claimantName = personName(dispute.claimant);
  const respondentName = personName(dispute.respondent);
  const claimantDisplayName = claimantName === 'You' ? 'yourself' : claimantName;

  // Effective claim amount — falls back to rental fee if requestedAmount wasn't set
  const effectiveClaimAmount = dispute.requestedAmount != null
    ? dispute.requestedAmount
    : (dispute.transaction?.rentalFee || 0);
  const hasClaimAmount = effectiveClaimAmount > 0;

  // Determine if this is a lender-filed or borrower-filed dispute for messaging
  const isLenderFiled = ['damagesClaim', 'nonReturn', 'lateReturn'].includes(dispute.type);

  return (
    <View style={styles.container}>
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
        <View style={[styles.cardBox, styles.section]}>
          <View style={[styles.sectionContent, styles.warningBanner]}>
            <Ionicons name="warning-outline" size={20} color={COLORS.danger} />
            <Text style={styles.warningText}>
              The authorization hold has expired. Manual follow-up is required to process this payment.
            </Text>
          </View>
        </View>
      )}

      {/* === Claim === */}
      <View style={[styles.cardBox, styles.section]}>
        <View style={styles.sectionContent}>
          <View style={styles.cardHeader}>
            <Ionicons name="flag" size={16} color={COLORS.primary} />
            <Text style={styles.cardHeaderLabel}>{claimantName === 'You' ? 'You filed a claim' : `${claimantName} filed a claim`}</Text>
            <Text style={styles.cardHeaderDate}>{timeAgo(dispute.createdAt)}</Text>
          </View>

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

          {dispute.photoUrls?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
              <View style={styles.photosRow}>
                {dispute.photoUrls.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.evidenceImage} />
                ))}
              </View>
            </ScrollView>
          )}

          {effectiveClaimAmount > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>
                {isLenderFiled ? 'Claimed' : 'Refund Requested'}
              </Text>
              <Text style={styles.amountValue}>{formatCurrency(effectiveClaimAmount)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Response */}
      {dispute.response ? (
        <View style={[styles.cardBox, styles.section]}>
          <View style={styles.sectionContent}>
            <View style={styles.cardHeader}>
              <Ionicons name="chatbubble" size={16} color={COLORS.secondary} />
              <Text style={styles.cardHeaderLabel}>{respondentName === 'You' ? 'Your response' : `${respondentName}'s response`}</Text>
              <Text style={styles.cardHeaderDate}>{timeAgo(dispute.response.respondedAt)}</Text>
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

            {dispute.response.counterAmount != null && (
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Counter Proposal</Text>
                <Text style={styles.amountValue}>{formatCurrency(dispute.response.counterAmount)}</Text>
              </View>
            )}

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
        </View>
      ) : dispute.status === 'awaitingResponse' && (
        <View style={[styles.cardBox, styles.section, styles.pendingCard]}>
          <View style={[styles.sectionContent, styles.pendingRow]}>
            <Ionicons name="hourglass-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.pendingText}>Awaiting response from {respondentName === 'You' ? 'you' : respondentName}...</Text>
          </View>
        </View>
      )}

      {/* Resolution */}
      {dispute.resolution && (
        <View style={[styles.cardBox, styles.section]}>
          <View style={styles.sectionContent}>
            <View style={styles.cardHeader}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.secondary} />
              <Text style={styles.cardHeaderLabel}>Resolution</Text>
              <Text style={styles.cardHeaderDate}>
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

            {dispute.resolution.resolvedBy ? (
              <Text style={styles.resolvedBy}>
                Resolved by {dispute.resolution.resolvedBy}
              </Text>
            ) : dispute.status === 'resolvedInFavorOfClaimant' ? (
              <Text style={styles.resolvedBy}>
                {respondentName === 'You' ? 'You accepted the claim' : `Accepted by ${respondentName}`}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Amounts at stake — only shown to organizers/admins who need full context */}
      {(dispute.isOrganizer || dispute.isAdmin) && dispute.transaction && (
        <View style={[styles.cardBox, styles.section]}>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>Transaction Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Rental Fee</Text>
              <Text style={styles.detailValue}>{formatCurrency(dispute.transaction.rentalFee)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Security Deposit</Text>
              <Text style={styles.detailValue}>{formatCurrency(dispute.transaction.depositAmount)}</Text>
            </View>
            <View style={[styles.detailRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Max Claimable</Text>
              <Text style={styles.totalValue}>
                {formatCurrency((dispute.transaction.rentalFee || 0) + (dispute.transaction.depositAmount || 0))}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Respondent action buttons */}
      {canRespond && (
        <View style={styles.respondActions}>
          <HapticPressable
            style={[styles.refundButton, acceptLoading && styles.buttonDisabled]}
            onPress={handleAcceptClaim}
            disabled={acceptLoading || actionLoading}
            haptic="medium"
          >
            {acceptLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Accept</Text>
              </>
            )}
          </HapticPressable>
          <HapticPressable
            style={[styles.declineButton, actionLoading && styles.buttonDisabled]}
            onPress={() => navigation.navigate('RespondToDispute', {
              disputeId: dispute.id,
              claimantName: dispute.claimant ? `${dispute.claimant.firstName} ${dispute.claimant.lastName}` : 'Claimant',
              type: dispute.type,
              description: dispute.description,
              requestedAmount: dispute.requestedAmount,
              mode: 'decline',
            })}
            disabled={acceptLoading || actionLoading}
            haptic="medium"
          >
            <Ionicons name="close-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Decline</Text>
          </HapticPressable>
          {hasClaimAmount && (
            <HapticPressable
              style={[styles.counterButton, actionLoading && styles.buttonDisabled]}
              onPress={() => navigation.navigate('RespondToDispute', {
                disputeId: dispute.id,
                claimantName: dispute.claimant ? `${dispute.claimant.firstName} ${dispute.claimant.lastName}` : 'Claimant',
                type: dispute.type,
                description: dispute.description,
                requestedAmount: dispute.requestedAmount,
                mode: 'counter',
              })}
              disabled={acceptLoading || actionLoading}
              haptic="medium"
            >
              <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Counter</Text>
            </HapticPressable>
          )}
        </View>
      )}

      {/* Counter offer response (for claimant) */}
      {canRespondToCounter && (
        <View style={styles.respondActions}>
          <HapticPressable
            style={[styles.refundButton, counterActionLoading && styles.buttonDisabled]}
            onPress={() => setShowAcceptCounterSheet(true)}
            disabled={counterActionLoading}
            haptic="medium"
          >
            {counterActionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Accept {formatCurrency(dispute.response.counterAmount)}</Text>
              </>
            )}
          </HapticPressable>
          <HapticPressable
            style={[styles.declineButton, counterActionLoading && styles.buttonDisabled]}
            onPress={() => setShowDeclineCounterSheet(true)}
            disabled={counterActionLoading}
            haptic="medium"
          >
            <Ionicons name="close-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Decline</Text>
          </HapticPressable>
        </View>
      )}

      {/* Waiting info (for claimant) */}
      {dispute.isClaimant && dispute.status === 'awaitingResponse' && (
        <View style={[styles.cardBox, styles.section]}>
          <View style={[styles.sectionContent, styles.infoRow]}>
            <Ionicons name="time-outline" size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>
              Waiting for {respondentName} to respond. {respondentName === 'You' ? 'You have' : 'They have'} 48 hours from when the dispute was filed.
            </Text>
          </View>
        </View>
      )}

      {/* Resolution Form (for organizers/admins) */}
      {canResolve && (
        <View style={[styles.cardBox, styles.section]}>
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
                  Max: {formatCurrency((dispute.transaction?.rentalFee || 0) + (dispute.transaction?.depositAmount || 0))} (rental fee + deposit)
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
        </View>
      )}

    </ScrollView>

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

      <ActionSheet
        isVisible={showAcceptSheet}
        onClose={() => setShowAcceptSheet(false)}
        title="Accept Claim"
        message={isLenderFiled
          ? `You agree to pay ${formatCurrency(effectiveClaimAmount)} to ${claimantDisplayName}. This will be deducted from the security deposit. This cannot be undone.`
          : `You agree to refund ${formatCurrency(effectiveClaimAmount)} to ${claimantDisplayName}. This cannot be undone.`
        }
        actions={[
          {
            label: isLenderFiled
              ? `Pay ${formatCurrency(effectiveClaimAmount)} to ${claimantDisplayName}`
              : `Refund ${formatCurrency(effectiveClaimAmount)} to ${claimantDisplayName}`,
            onPress: performAccept,
            destructive: true,
          },
        ]}
      />

      <ActionSheet
        isVisible={showAcceptCounterSheet}
        onClose={() => setShowAcceptCounterSheet(false)}
        title="Accept Counter Offer"
        message={`You are accepting ${respondentName === 'You' ? 'your' : `${respondentName}'s`} counter offer of ${formatCurrency(dispute?.response?.counterAmount)}. The dispute will be resolved immediately.`}
        actions={[
          {
            label: `Accept ${formatCurrency(dispute?.response?.counterAmount)}`,
            onPress: performAcceptCounter,
            primary: true,
          },
        ]}
      />

      <ActionSheet
        isVisible={showDeclineCounterSheet}
        onClose={() => setShowDeclineCounterSheet(false)}
        title="Decline Counter Offer"
        message="This dispute will be sent to an organizer for arbitration. They will review both sides and make a final decision."
        actions={[
          {
            label: 'Decline & Send to Arbitration',
            onPress: performDeclineCounter,
            destructive: true,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
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
    marginTop: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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

  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
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

  // Card headers
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  cardHeaderLabel: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  cardHeaderDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  pendingCard: {
    opacity: 0.7,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pendingText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    flex: 1,
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
    borderRadius: 10,
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
  totalRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  totalLabel: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '700',
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

  // Respondent action buttons
  respondActions: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  refundButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.danger,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  counterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.warning,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  actionButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.button,
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
