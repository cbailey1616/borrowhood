import { isSaleListing, directFeeLabel, isTransferListing } from '../utils/directFee';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borrowGuidance } from '../utils/borrowStatus';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
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
  const insets = useSafeAreaInsets();
  const { id } = route.params;
  const { user } = useAuth();
  const { showError, showToast } = useError();
  const [transaction, setTransaction] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [returnSheetVisible, setReturnSheetVisible] = useState(false);
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef(null);
  const cancelInProgress = useRef(false);

  useFocusEffect(useCallback(() => {
    fetchTransaction();
    dismissRelatedNotifications(id);
    pollRef.current = setInterval(fetchTransaction, 10000);
    return () => clearInterval(pollRef.current);
  }, [id]));

  const isGiveaway = isTransferListing(transaction);
  useEffect(() => { navigation.setOptions({ title: isGiveaway ? 'Exchange details' : 'Borrow details' }); }, [isGiveaway, navigation]);

  // Schedule or cancel return reminders based on transaction status (skip for giveaways)
  useEffect(() => {
    if (!transaction) return;
    if (transaction.status === 'picked_up' && !isGiveaway) {
      scheduleReturnReminders(id, transaction.endDate, transaction.listing?.title || 'Item');
    } else if (['returned', 'completed', 'cancelled'].includes(transaction.status)) {
      cancelReturnReminders(id);
    }
  }, [transaction?.status]);

  const fetchTransaction = async () => {
    try {
      const data = await api.getTransaction(id);
      setTransaction(data);
      setFetchError(null);
    } catch (error) {
      console.error('Failed to fetch transaction:', error);
      setFetchError('Could not load this exchange. Check your connection and try again.');
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
      if (false && result.conditionDegraded) {
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

  const handleCancel = async () => {
    if (cancelInProgress.current) return;
    cancelInProgress.current = true;
    setActionLoading(true);
    try {
      await api.cancelRental(id);
      haptics.success();
      showToast('Borrow cancelled.', 'success');
      navigation.goBack();
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Couldn\'t cancel right now. Please check your connection and try again.' });
    } finally {
      cancelInProgress.current = false;
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

  if (!transaction) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="receipt-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
        <Text style={styles.errorTitle}>Borrow details unavailable</Text>
        <Text style={styles.errorSubtext}>This exchange may have been removed or is no longer accessible.</Text>
        <HapticPressable
          style={styles.errorButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.errorButtonText}>Go Back</Text>
        </HapticPressable>
      </View>
    );
  }

  const nextStep = borrowGuidance({ ...transaction, isGiveaway });
  const otherPerson = transaction.isBorrower ? transaction.lender : transaction.borrower;
  const roleLabel = isSaleListing(transaction) ? (transaction.isBorrower ? 'Seller' : 'Buyer') : isGiveaway
    ? (transaction.isBorrower ? 'Giver' : 'Recipient')
    : (transaction.isBorrower ? 'Owner' : 'Borrower');

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
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <Text style={styles.pageEyebrow}>{isSaleListing(transaction) ? 'Your exchange' : isGiveaway ? 'A new home for something good' : transaction.isBorrower ? 'Your borrow, at a glance' : 'Sharing with a neighbor'}</Text>
        <View style={styles.statusHero} accessibilityLiveRegion="polite">
          <View style={styles.heroIcon}><Ionicons name={transaction.status === 'pending' ? 'request-note' : ['approved', 'paid'].includes(transaction.status) ? 'chatbubble' : transaction.status === 'cancelled' ? 'close-circle' : ['completed', 'returned'].includes(transaction.status) ? 'home' : isGiveaway ? 'gift' : 'basket'} size={46} illustrated color={COLORS.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{nextStep.title}</Text>
            <Text style={styles.heroDescription}>{nextStep.detail}</Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <HapticPressable haptic="light" accessibilityRole="button" accessibilityLabel={`View ${transaction.listing.title}`}
            style={styles.itemSummary} onPress={() => navigation.navigate('ListingDetail', { id: transaction.listing.id })}>
            {transaction.listing.photos?.[0] ? <Image source={{ uri: transaction.listing.photos[0] }} style={styles.itemPhoto} />
              : <View style={[styles.itemPhoto, styles.imagePlaceholder]}><Ionicons name={isGiveaway ? 'gift' : 'basket'} size={46} illustrated /></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>{isSaleListing(transaction) ? 'For sale' : isGiveaway ? 'Giveaway' : 'Borrowing'}</Text>
              <Text style={styles.itemName}>{transaction.listing.title}</Text>
              <Text style={styles.detailText}>{CONDITION_LABELS[transaction.listing.condition]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </HapticPressable>
          <View style={styles.cardDivider} />
          <RentalProgress status={transaction.status} isBorrower={transaction.isBorrower} isGiveaway={isGiveaway} isSale={isSaleListing(transaction)} />
          {!isGiveaway && <>
            <View style={styles.cardDivider} />
            <View style={styles.borrowDates}>
              <View style={styles.borrowDate}>
                <Text style={styles.smallLabel}>Pickup</Text>
                <Text style={styles.borrowDateValue}>{new Date(transaction.startDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                <Text style={styles.detailText}>{new Date(transaction.startDate).getFullYear()}</Text>
              </View>
              <Ionicons name="arrow-forward" size={22} color={COLORS.primary} />
              <View style={styles.borrowDate}>
                <Text style={styles.smallLabel}>Return by</Text>
                <Text style={styles.borrowDateValue}>{new Date(transaction.endDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                <Text style={styles.detailText}>{new Date(transaction.endDate).getFullYear()}</Text>
              </View>
            </View>
            <Text style={styles.durationNote}>{transaction.rentalDays} {transaction.rentalDays === 1 ? 'day' : 'days'} together</Text>
          </>}
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.cardEyebrow}>Your neighbor</Text>
          <HapticPressable haptic="light" accessibilityRole="button" style={styles.neighborRow}
            onPress={() => navigation.navigate('UserProfile', { id: otherPerson.id })}>
            {otherPerson.profilePhotoUrl ? <Image source={{ uri: otherPerson.profilePhotoUrl }} style={styles.neighborAvatar} />
              : <View style={[styles.neighborAvatar, styles.avatarPlaceholder]}><Ionicons name="people" size={30} illustrated /></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.detailText}>{roleLabel}</Text>
              <Text style={styles.neighborName}>{otherPerson.firstName} {otherPerson.lastName}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
          </HapticPressable>
          <HapticPressable haptic="light" accessibilityRole="button" accessibilityLabel={`Message ${otherPerson.firstName} privately`}
            style={styles.neighborMessage} onPress={async () => {
              const params = { recipientId: otherPerson.id, recipient: otherPerson, listingId: transaction.listing.id,
                listing: transaction.listing, threadContext: { id: transaction.listing.id, title: transaction.listing.title, type: 'listing' } };
              try {
                const conversations = await api.getConversations();
                const existing = conversations.find(chat => chat.otherUser?.id === otherPerson.id);
                navigation.navigate('Chat', { ...params, conversationId: existing?.id });
              } catch { navigation.navigate('Chat', params); }
            }}>
            <Ionicons name="chatbubble" size={26} illustrated />
            <View style={{ flex: 1 }}>
              <Text style={styles.neighborMessageTitle}>Message {otherPerson.firstName}</Text>
              <Text style={styles.neighborMessageHint}>Private · about {transaction.listing.title}</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
          </HapticPressable>
        </View>

        {isSaleListing(transaction) && <View style={styles.detailCard}>
          <Text style={styles.cardEyebrow}>Sale price</Text>
          <Text style={styles.itemName}>{directFeeLabel(transaction)}</Text>
          <Text style={styles.detailText}>Confirm the price and arrange payment directly with your neighbor before pickup. Borrowhood does not process payments.</Text>
        </View>}

        {(transaction.borrowerMessage || transaction.lenderResponse) && <View style={styles.detailCard}>
          <Text style={styles.cardEyebrow}>Request notes · private</Text>
          {!!transaction.borrowerMessage && <View style={styles.noteQuote}>
            <Text style={styles.smallLabel}>{transaction.isBorrower ? 'You wrote' : `${transaction.borrower.firstName} wrote`}</Text>
            <Text style={styles.noteText}>{transaction.borrowerMessage}</Text>
          </View>}
          {!!transaction.lenderResponse && <View style={styles.noteQuote}>
            <Text style={styles.smallLabel}>{transaction.isLender ? 'You replied' : `${transaction.lender.firstName} replied`}</Text>
            <Text style={styles.noteText}>{transaction.lenderResponse}</Text>
          </View>}
        </View>}

        {/* Dispute Banner */}
        {false && transaction?.hasDispute && transaction?.disputeId && (() => {
          const active = ['pending', 'awaitingResponse', 'underReview'].includes(transaction.disputeStatus);
          const bannerColor = active ? COLORS.danger : COLORS.secondary;
          return (
            <HapticPressable
              haptic="light"
              style={[styles.disputeBanner, { backgroundColor: bannerColor + '15' }]}
              onPress={() => navigation.navigate('DisputeDetail', { id: transaction.disputeId })}
            >
              <Ionicons name={active ? 'alert-circle' : 'checkmark-circle'} size={20} color={bannerColor} />
              <View style={styles.disputeBannerContent}>
                <Text style={[styles.disputeBannerTitle, { color: bannerColor }]}>
                  {active ? 'Active Dispute' : 'Dispute Resolved'}
                </Text>
                <Text style={[styles.disputeBannerSubtitle, { color: bannerColor }]}>Tap to view details</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={bannerColor} />
            </HapticPressable>
          );
        })()}

        {/* Overdue Banner — not for giveaways */}
        {!isGiveaway && transaction.status === 'picked_up' && new Date() > new Date(transaction.endDate) && (
          <View style={styles.overdueBanner}>
            <Ionicons name="warning" size={20} color={COLORS.warning} />
            <Text style={styles.overdueText}>This item is overdue</Text>
          </View>
        )}

        {/* Completed / Returned banner (hide if dispute exists) */}
        {transaction.status === 'returned' && transaction.actualReturnAt && !transaction.hasDispute && (
          <View style={styles.returnedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.secondary} />
            <Text style={styles.returnedBannerText}>
              {isGiveaway
                ? 'Item received! Enjoy your new item.'
                : ((transaction.rentalFee || 0) + (transaction.depositAmount || 0)) > 0
                  ? 'Item returned. Discuss any remaining details with your neighbor.'
                  : 'Item returned. This transaction is complete.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Actions */}
      {transaction.isLender && transaction.status === 'pending' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
      {transaction.isBorrower && !transaction.actualPickupAt && transaction.status === 'pending' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <HapticPressable
            testID="Transaction.button.cancel"
            accessibilityLabel="Cancel borrow"
            accessibilityRole="button"
            haptic="light"
            style={styles.declineButton}
            onPress={() => setCancelSheetVisible(true)}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <Text style={styles.declineButtonText}>Cancel borrow</Text>
            )}
          </HapticPressable>
        </View>
      )}

      {(transaction.isBorrower || transaction.isLender) && !transaction.actualPickupAt && ['paid', 'approved'].includes(transaction.status) && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <HapticPressable
            testID="Transaction.button.cancel"
            accessibilityRole="button"
            accessibilityLabel="Cancel borrow"
            haptic="light"
            style={styles.declineButton}
            onPress={() => setCancelSheetVisible(true)}
            disabled={actionLoading}
          >
            {actionLoading ? <ActivityIndicator color={COLORS.text} size="small" /> : <Text style={styles.declineButtonText}>Cancel borrow</Text>}
          </HapticPressable>
          {transaction.isBorrower && <HapticPressable
            testID="Transaction.button.confirmPickup"
            accessibilityLabel="Confirm pickup"
            accessibilityRole="button"
            haptic="medium"
            style={styles.approveButton}
            onPress={handleConfirmPickup}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Confirm Pickup</Text>
          </HapticPressable>}
        </View>
      )}

      {/* Borrower: Submit return + Report Issue (Report Issue only for paid transactions) */}
      {transaction.isBorrower && transaction.status === 'picked_up' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <HapticPressable
            haptic="medium"
            style={styles.approveButton}
            onPress={() => setReturnSheetVisible(true)}
            disabled={actionLoading}
          >
            <Text style={styles.approveButtonText}>Return Item</Text>
          </HapticPressable>
          {false && ((transaction.rentalFee || 0) + (transaction.depositAmount || 0)) > 0 && (
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
          )}
        </View>
      )}

      {/* Lender: Confirm return + Report Issue (Report Issue only for paid transactions) */}
      {transaction.isLender && ['picked_up', 'return_pending'].includes(transaction.status) && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
          {false && ((transaction.rentalFee || 0) + (transaction.depositAmount || 0)) > 0 && (
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
          )}
        </View>
      )}

      {/* Lender: Confirm return & release deposit when borrower already reported */}
      {transaction.isLender && transaction.status === 'returned' &&
        transaction.paymentStatus === 'authorized' && !transaction.hasDispute && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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

      {/* Report Issue button — either party can dispute within 7 days of return (paid transactions only) */}
      {false && ['returned', 'completed'].includes(transaction?.status) &&
        !transaction?.hasDispute &&
        transaction?.actualReturnAt &&
        ((transaction.rentalFee || 0) + (transaction.depositAmount || 0)) > 0 &&
        (Date.now() - new Date(transaction.actualReturnAt).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
            Dispute window closes {new Date(new Date(transaction.actualReturnAt).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        </View>
      )}

      <ActionSheet
        isVisible={returnSheetVisible && transaction?.isBorrower}
        onClose={() => setReturnSheetVisible(false)}
        variant="confirmation"
        icon={<Ionicons name="cube" size={28} illustrated />}
        title="Item returned?"
        message="Confirm once the item is back with your neighbor."
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
        variant="confirmation"
        icon={<Ionicons name="cube" size={28} illustrated />}
        title="Everything back?"
        message={`Confirm once ${transaction?.listing?.title || 'the item'} is back with you in the same condition. If something needs attention, message your neighbor first.`}
        actions={[
          {
            label: 'Confirm return',
            testID: 'Transaction.confirmReturn',
            onPress: () => handleConfirmReturn(transaction?.conditionAtPickup || 'good'),
            primary: true,
          },
          {
            label: 'Message neighbor',
            testID: 'Transaction.messageAboutReturn',
            onPress: () => navigation.navigate('Chat', { recipientId: transaction?.borrower?.id, recipient: transaction?.borrower, listingId: transaction?.listing?.id, listing: transaction?.listing }),
          },
        ]}
      />

      <ActionSheet
        isVisible={cancelSheetVisible}
        onClose={() => setCancelSheetVisible(false)}
        title="Cancel this borrow?"
        message="Plans changed? This will cancel the pickup and let your neighbor know."
        actions={[
          {
            label: 'Cancel borrow',
            testID: 'Transaction.confirmCancel',
            onPress: handleCancel,
            destructive: true,
          },
        ]}
        cancelLabel="Keep borrow"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pageContent: { padding: 18, paddingBottom: 28, gap: 16 },
  pageEyebrow: { fontSize: 11, lineHeight: 16, letterSpacing: 1.1, textTransform: 'uppercase', color: COLORS.textSecondary, fontWeight: '600', marginTop: 6 },
  statusHero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.primaryMuted, borderRadius: 24, padding: 20 },
  heroIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 23, lineHeight: 29, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  heroDescription: { fontSize: 14, lineHeight: 21, color: COLORS.textSecondary },
  detailCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 24, padding: 18 },
  itemSummary: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  itemPhoto: { width: 74, height: 82, borderRadius: 17, backgroundColor: COLORS.primaryMuted },
  itemName: { color: COLORS.text, fontSize: 22, lineHeight: 27, fontWeight: '600', marginVertical: 4 },
  smallLabel: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  detailText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 18 },
  borrowDates: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  borrowDate: { flex: 1 },
  borrowDateValue: { color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '600', marginTop: 6 },
  durationNote: { color: COLORS.primary, fontSize: 12, textAlign: 'center', marginTop: 12 },
  cardEyebrow: { fontSize: 12, fontWeight: '600', color: COLORS.primary, marginBottom: 15 },
  neighborRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  neighborAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primaryMuted },
  neighborName: { color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  neighborMessage: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 17, backgroundColor: COLORS.primaryMuted, padding: 14, marginTop: 18 },
  neighborMessageTitle: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  neighborMessageHint: { fontSize: 12, lineHeight: 17, color: COLORS.textSecondary, marginTop: 3 },
  noteQuote: { borderLeftWidth: 3, borderLeftColor: COLORS.primaryMuted, paddingLeft: 12, marginBottom: 12 },
  noteText: { fontSize: 15, lineHeight: 22, color: COLORS.text, marginTop: 6 },
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
  errorTitle: {
    ...TYPOGRAPHY.title3,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  errorSubtext: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
    marginBottom: SPACING.xl,
  },
  errorButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  errorButtonText: {
    ...TYPOGRAPHY.body,
    color: '#FFFFFF',
    fontWeight: '600',
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
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary + '10',
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  messageButtonText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.primary,
    flex: 1,
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
});
