import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import RentalProgress from '../components/RentalProgress';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, TRANSACTION_STATUS_LABELS, CONDITION_LABELS } from '../utils/config';
import { scheduleReturnReminders, cancelReturnReminders } from '../utils/returnReminders';

async function dismissRelatedNotifications(transactionId) {
  try {
    const delivered = await Notifications.getPresentedNotificationsAsync();
    for (const n of delivered) {
      if (n.request.content.data?.transactionId === transactionId) {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      }
    }
    // Reset badge count
    await Notifications.setBadgeCountAsync(0);
  } catch (e) {
    // Ignore — notifications may not be available on simulator
  }
}

export default function TransactionDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { user } = useAuth();
  const { showError, showToast } = useError();
  const [transaction, setTransaction] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [returnSheetVisible, setReturnSheetVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingFormVisible, setRatingFormVisible] = useState(false);
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef(null);

  useFocusEffect(useCallback(() => {
    fetchTransaction();
    dismissRelatedNotifications(id);
    pollRef.current = setInterval(fetchTransaction, 10000);
    return () => clearInterval(pollRef.current);
  }, [id]));

  // Schedule or cancel return reminders based on transaction status
  useEffect(() => {
    if (!transaction) return;
    if (transaction.status === 'picked_up') {
      scheduleReturnReminders(id, transaction.endDate, transaction.listing?.title || 'Item');
    } else if (['returned', 'completed', 'cancelled'].includes(transaction.status)) {
      cancelReturnReminders(id);
    }
  }, [transaction?.status]);

  const fetchTransaction = async () => {
    try {
      const data = await api.getTransaction(id);
      setTransaction(data);
    } catch (error) {
      console.error('Failed to fetch transaction:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransaction();
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await api.approveRental(id);
      fetchTransaction();
      haptics.success();
      showToast('Request approved! The borrower has been notified.', 'success');
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Something went wrong approving this request. Please check your connection and try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    setActionLoading(true);
    try {
      await api.declineRental(id);
      haptics.success();
      navigation.goBack();
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Something went wrong declining this request. Please check your connection and try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmPickup = async () => {
    setActionLoading(true);
    try {
      await api.confirmRentalPickup(id);
      fetchTransaction();
      haptics.success();
      showToast('Pickup confirmed!', 'success');
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Couldn\'t confirm the pickup right now. Please check your connection and try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReturn = async (condition) => {
    setActionLoading(true);
    try {
      const result = await api.confirmRentalReturn(id, condition);
      if (result.conditionDegraded) {
        haptics.warning();
        navigation.navigate('DamageClaim', {
          transactionId: id,
          depositAmount: transaction.depositAmount,
          listingTitle: transaction.listing.title,
          conditionAtPickup: transaction.conditionAtPickup,
          conditionAtReturn: condition,
        });
      } else {
        fetchTransaction();
        haptics.success();
        showToast('Return confirmed!', 'success');
      }
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Couldn\'t confirm the return right now. Please check your connection and try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (selectedRating === 0) return;
    setActionLoading(true);
    try {
      await api.rateTransaction(id, selectedRating, ratingComment || undefined);
      haptics.success();
      showToast('Thanks for the rating!', 'success');
      setRatingFormVisible(false);
      fetchTransaction();
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Couldn\'t submit your rating right now. Please check your connection and try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await api.cancelRental(id);
      haptics.success();
      showToast('Request cancelled. Any payment hold has been released.', 'success');
      navigation.goBack();
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Couldn\'t cancel right now. Please check your connection and try again.' });
    } finally {
      setActionLoading(false);
    }
  };


  const canRate = ['returned', 'completed'].includes(transaction?.status) && !transaction?.myRating;

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Item Info */}
        <HapticPressable
          haptic="light"
          style={styles.listingCard}
          onPress={() => navigation.navigate('ListingDetail', { id: transaction.listing.id })}
        >
          {transaction.listing.photos?.[0] ? (
            <Image
              source={{ uri: transaction.listing.photos[0] }}
              style={styles.listingImage}
            />
          ) : (
            <View style={[styles.listingImage, styles.imagePlaceholder]}>
              <Ionicons name="image-outline" size={24} color={COLORS.gray[400]} />
            </View>
          )}
          <View style={styles.listingInfo}>
            <Text style={styles.listingTitle}>{transaction.listing.title}</Text>
            <Text style={styles.listingCondition}>
              {CONDITION_LABELS[transaction.listing.condition]}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
        </HapticPressable>

        {/* Progress Tracker */}
        <View style={styles.statusCard}>
          <RentalProgress
            status={transaction.status}
            isBorrower={transaction.isBorrower}
            paymentStatus={transaction.paymentStatus}
          />
        </View>

        {/* Other Person */}
        <HapticPressable
          haptic="light"
          style={styles.personCard}
          onPress={() => navigation.navigate('UserProfile', { id: otherPerson.id })}
        >
          {otherPerson.profilePhotoUrl ? (
            <Image
              source={{ uri: otherPerson.profilePhotoUrl }}
              style={styles.personAvatar}
            />
          ) : (
            <View style={[styles.personAvatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={22} color={COLORS.gray[400]} />
            </View>
          )}
          <View style={styles.personInfo}>
            <Text style={styles.personRole}>{roleLabel}</Text>
            <Text style={styles.personName}>
              {otherPerson.firstName} {otherPerson.lastName}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
        </HapticPressable>

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
              <Text style={styles.priceValue}>${(transaction.rentalFee || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Refundable deposit</Text>
              <Text style={styles.priceValue}>${(transaction.depositAmount || 0).toFixed(2)}</Text>
            </View>
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                ${((transaction.rentalFee || 0) + (transaction.depositAmount || 0)).toFixed(2)}
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

        {/* Your Rating (read-only) */}
        {transaction.myRating && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rating</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= transaction.myRating.rating ? 'star' : 'star-outline'}
                  size={24}
                  color={COLORS.warning}
                />
              ))}
            </View>
            {transaction.myRating.comment ? (
              <Text style={[styles.messageText, { marginTop: SPACING.sm }]}>
                {transaction.myRating.comment}
              </Text>
            ) : null}
          </View>
        )}

        {/* Dispute Banner */}
        {transaction?.hasDispute && transaction?.disputeId && (() => {
          const resolved = ['resolvedInFavorOfClaimant', 'resolvedInFavorOfRespondent', 'dismissed', 'expired'].includes(transaction.disputeStatus);
          const bannerColor = resolved ? COLORS.secondary : COLORS.danger;
          return (
            <HapticPressable
              haptic="light"
              style={[styles.disputeBanner, { backgroundColor: bannerColor + '15' }]}
              onPress={() => navigation.navigate('DisputeDetail', { id: transaction.disputeId })}
            >
              <Ionicons name={resolved ? 'checkmark-circle' : 'alert-circle'} size={20} color={bannerColor} />
              <View style={styles.disputeBannerContent}>
                <Text style={[styles.disputeBannerTitle, { color: bannerColor }]}>
                  {resolved ? 'Dispute Resolved' : 'Active Dispute'}
                </Text>
                <Text style={[styles.disputeBannerSubtitle, { color: bannerColor }]}>Tap to view details</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={bannerColor} />
            </HapticPressable>
          );
        })()}

        {/* Overdue Banner */}
        {transaction.status === 'picked_up' && new Date() > new Date(transaction.endDate) && (
          <View style={styles.overdueBanner}>
            <Ionicons name="warning" size={20} color={COLORS.warning} />
            <Text style={styles.overdueText}>This rental is overdue</Text>
          </View>
        )}

        {/* Returned — auto-close info (hide if dispute exists) */}
        {transaction.status === 'returned' && transaction.actualReturnAt && !transaction.hasDispute && (
          <View style={styles.returnedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.secondary} />
            <Text style={styles.returnedBannerText}>
              Item returned. This transaction will close automatically in {Math.max(0, Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(transaction.actualReturnAt).getTime())) / (24 * 60 * 60 * 1000)))} days if no dispute is filed.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Actions */}
      {transaction.isLender && transaction.status === 'pending' && (
        <View style={styles.footer}>
          <HapticPressable
            testID="Transaction.button.decline"
            accessibilityLabel="Decline request"
            accessibilityRole="button"
            haptic="light"
            style={styles.declineButton}
            onPress={handleDecline}
            disabled={actionLoading}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </HapticPressable>
          <HapticPressable
            testID="Transaction.button.approve"
            accessibilityLabel="Approve request"
            accessibilityRole="button"
            haptic="medium"
            style={styles.approveButton}
            onPress={handleApprove}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.approveButtonText}>Approve</Text>
            )}
          </HapticPressable>
        </View>
      )}

      {/* Borrower: Cancel request before pickup */}
      {transaction.isBorrower && ['pending', 'approved', 'paid'].includes(transaction.status) && (
        <View style={styles.footer}>
          <HapticPressable
            testID="Transaction.button.cancel"
            accessibilityLabel="Cancel request"
            accessibilityRole="button"
            haptic="light"
            style={styles.declineButton}
            onPress={() => setCancelSheetVisible(true)}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <Text style={styles.declineButtonText}>Cancel Request</Text>
            )}
          </HapticPressable>
        </View>
      )}

      {transaction.isLender && ['paid', 'approved'].includes(transaction.status) && (
        <View style={styles.footer}>
          <HapticPressable
            haptic="light"
            style={styles.declineButton}
            onPress={() => setCancelSheetVisible(true)}
            disabled={actionLoading}
          >
            <Text style={styles.declineButtonText}>Cancel</Text>
          </HapticPressable>
          <HapticPressable
            testID="Transaction.button.confirmPickup"
            accessibilityLabel="Confirm pickup"
            accessibilityRole="button"
            haptic="medium"
            style={styles.approveButton}
            onPress={handleConfirmPickup}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Confirm Pickup</Text>
          </HapticPressable>
        </View>
      )}

      {/* Borrower: Submit return + Report Issue */}
      {transaction.isBorrower && transaction.status === 'picked_up' && (
        <View style={styles.footer}>
          <HapticPressable
            haptic="medium"
            style={styles.approveButton}
            onPress={() => setReturnSheetVisible(true)}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Return Item</Text>
          </HapticPressable>
          <HapticPressable
            haptic="light"
            style={styles.reportIssueButton}
            onPress={() => navigation.navigate('ReportIssue', {
              transactionId: id,
              depositAmount: transaction?.depositAmount,
              rentalFee: transaction?.rentalFee,
              listingTitle: transaction?.listing?.title,
              borrowerId: transaction?.borrower?.id,
              lenderId: transaction?.lender?.id,
            })}
          >
            <Ionicons name="warning-outline" size={20} color={COLORS.danger} />
            <Text style={styles.reportIssueText}>Report an Issue</Text>
          </HapticPressable>
        </View>
      )}

      {/* Lender: Confirm return + Report Issue */}
      {transaction.isLender && transaction.status === 'picked_up' && (
        <View style={styles.footer}>
          <HapticPressable
            testID="Transaction.button.confirmReturn"
            accessibilityLabel="Confirm return"
            accessibilityRole="button"
            haptic="medium"
            style={styles.approveButton}
            onPress={() => setReturnSheetVisible(true)}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Confirm Return</Text>
          </HapticPressable>
          <HapticPressable
            haptic="light"
            style={styles.reportIssueButton}
            onPress={() => navigation.navigate('ReportIssue', {
              transactionId: id,
              depositAmount: transaction?.depositAmount,
              rentalFee: transaction?.rentalFee,
              listingTitle: transaction?.listing?.title,
              borrowerId: transaction?.borrower?.id,
              lenderId: transaction?.lender?.id,
            })}
          >
            <Ionicons name="warning-outline" size={20} color={COLORS.danger} />
            <Text style={styles.reportIssueText}>Report an Issue</Text>
          </HapticPressable>
        </View>
      )}

      {/* Rate button */}
      {canRate && !ratingFormVisible && (
        <View style={styles.footer}>
          <HapticPressable
            haptic="medium"
            style={styles.approveButton}
            onPress={() => setRatingFormVisible(true)}
          >
            <Text style={styles.approveButtonText}>Rate {otherPerson.firstName}</Text>
          </HapticPressable>
        </View>
      )}

      {/* Inline rating form */}
      {canRate && ratingFormVisible && (
        <View style={styles.ratingFooter}>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <HapticPressable
                key={star}
                haptic="light"
                style={styles.starButton}
                onPress={() => setSelectedRating(star)}
              >
                <Ionicons
                  name={star <= selectedRating ? 'star' : 'star-outline'}
                  size={32}
                  color={COLORS.warning}
                />
              </HapticPressable>
            ))}
          </View>
          <TextInput
            style={styles.ratingInput}
            placeholder="Add a comment (optional)"
            placeholderTextColor={COLORS.gray[500]}
            value={ratingComment}
            onChangeText={setRatingComment}
            maxLength={500}
            multiline
          />
          <View style={styles.ratingActions}>
            <HapticPressable
              haptic="light"
              style={styles.declineButton}
              onPress={() => {
                setRatingFormVisible(false);
                setSelectedRating(0);
                setRatingComment('');
              }}
            >
              <Text style={styles.declineButtonText}>Cancel</Text>
            </HapticPressable>
            <HapticPressable
              haptic="medium"
              style={[styles.approveButton, selectedRating === 0 && { opacity: 0.5 }]}
              onPress={handleSubmitRating}
              disabled={actionLoading || selectedRating === 0}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.approveButtonText}>Submit</Text>
              )}
            </HapticPressable>
          </View>
        </View>
      )}

      {/* Lender: Confirm return & release deposit when borrower already reported */}
      {transaction.isLender && transaction.status === 'returned' &&
        transaction.paymentStatus === 'authorized' && !transaction.hasDispute && (
        <View style={styles.footer}>
          <HapticPressable
            haptic="medium"
            style={styles.approveButton}
            onPress={() => setReturnSheetVisible(true)}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Confirm Return & Release Deposit</Text>
          </HapticPressable>
        </View>
      )}

      {/* Report Issue button — either party can dispute within 7 days of return */}
      {['returned', 'completed'].includes(transaction?.status) &&
        !transaction?.hasDispute &&
        transaction?.actualReturnAt &&
        (Date.now() - new Date(transaction.actualReturnAt).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
        <View style={styles.footer}>
          <HapticPressable
            testID="Transaction.button.reportIssue"
            accessibilityLabel="Report an issue"
            accessibilityRole="button"
            haptic="medium"
            style={styles.reportIssueButton}
            onPress={() => navigation.navigate('ReportIssue', {
              transactionId: id,
              depositAmount: transaction?.depositAmount,
              rentalFee: transaction?.rentalFee,
              listingTitle: transaction?.listing?.title,
              borrowerId: transaction?.borrower?.id,
              lenderId: transaction?.lender?.id,
            })}
          >
            <Ionicons name="warning-outline" size={20} color={COLORS.danger} />
            <Text style={styles.reportIssueText}>Report an Issue</Text>
          </HapticPressable>
          <Text style={styles.disputeWindowText}>
            You have {Math.max(0, Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(transaction.actualReturnAt).getTime())) / (24 * 60 * 60 * 1000)))} days left to file a dispute
          </Text>
        </View>
      )}

      <ActionSheet
        isVisible={returnSheetVisible && transaction?.isBorrower}
        onClose={() => setReturnSheetVisible(false)}
        title="Return Item"
        message="Confirm that you've returned the item to the lender. They'll have 7 days to report any issues."
        actions={[
          {
            label: 'Confirm Return',
            onPress: () => handleConfirmReturn(transaction?.conditionAtPickup || 'good'),
            primary: true,
          },
        ]}
      />

      <ActionSheet
        isVisible={returnSheetVisible && transaction?.isLender}
        onClose={() => setReturnSheetVisible(false)}
        title="Confirm Return"
        message="Is the item in the same condition as when it was picked up?"
        actions={[
          {
            label: 'Yes, looks good',
            onPress: () => handleConfirmReturn(transaction?.conditionAtPickup || 'good'),
            primary: true,
          },
          {
            label: 'No, there\'s an issue',
            onPress: () => {
              setReturnSheetVisible(false);
              navigation.navigate('DamageClaim', {
                transactionId: id,
                depositAmount: transaction?.depositAmount,
                listingTitle: transaction?.listing?.title,
                conditionAtPickup: transaction?.conditionAtPickup,
              });
            },
            destructive: true,
          },
        ]}
      />

      <ActionSheet
        isVisible={cancelSheetVisible}
        onClose={() => setCancelSheetVisible(false)}
        title="Cancel Request"
        message="Are you sure? Any payment hold will be released immediately."
        actions={[
          {
            label: 'Cancel Request',
            onPress: handleCancel,
            destructive: true,
          },
        ]}
        cancelLabel="Keep Request"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warning + '15',
    padding: SPACING.lg,
    marginTop: SPACING.md,
  },
  returnedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.secondary + '15',
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
  },
  returnedBannerText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.text,
    flex: 1,
    lineHeight: 20,
  },
  overdueText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.warning,
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
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  listingImage: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[200],
  },
  listingInfo: {
    flex: 1,
  },
  listingTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  listingCondition: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  statusBadge: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.xl,
  },
  statusText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
  },
  personCard: {
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
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.gray[200],
  },
  personInfo: {
    flex: 1,
  },
  personRole: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  personName: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  section: {
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  sectionTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
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
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  dateValue: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  daysText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  priceBreakdown: {
    gap: SPACING.sm,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  priceValue: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.text,
  },
  totalRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  totalLabel: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  totalValue: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  messageText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    gap: SPACING.md,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    alignItems: 'center',
  },
  declineButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.text,
  },
  approveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  approveButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  reportIssueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    backgroundColor: COLORS.danger + '10',
  },
  reportIssueText: {
    ...TYPOGRAPHY.button,
    color: COLORS.danger,
  },
  disputeWindowText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  disputeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.danger + '15',
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
  },
  disputeBannerContent: {
    flex: 1,
  },
  disputeBannerTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.danger,
  },
  disputeBannerSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.danger,
    opacity: 0.8,
    marginTop: 2,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray[800],
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray[800],
  },
  starsRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  starButton: {
    padding: SPACING.xs,
  },
  ratingFooter: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    gap: SPACING.md,
  },
  ratingInput: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  ratingActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
});
