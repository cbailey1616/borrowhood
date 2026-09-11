import TextInput from '../components/AppTextInput';
import ShimmerImage from '../components/ShimmerImage';
import { useState, useEffect } from 'react';
import { directFeeLabel, isSaleListing, isTransferListing } from '../utils/directFee';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Image,
  ActivityIndicator,

  Platform,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ENABLE_PAID_TIERS } from '../utils/config';

export default function BorrowRequestScreen({ route, navigation }) {
  const { listing } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const { user, isGracePeriodActive } = useAuth();
  const { showError } = useError();
  const isGiveaway = isTransferListing(listing);
  useEffect(() => { navigation.setOptions({ title: isSaleListing(listing) ? 'Request to buy' : isGiveaway ? 'Request this item' : 'Request to borrow' }); }, [listing.listingType, listing.directFee, navigation]);
  const [accessCheck, setAccessCheck] = useState({ loading: true, canAccess: true, reason: null });
  const minDays = Math.max(1, Number(listing.minDuration) || 1);
  const maxDays = Math.max(minDays, Number(listing.maxDuration) || 14);
  const addDays = (date, days) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };
  const clampEnd = (date, start) => new Date(Math.min(addDays(start, maxDays).getTime(), Math.max(addDays(start, minDays).getTime(), date.getTime())));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(() => {
    const end = new Date(tomorrow);
    end.setDate(end.getDate() + minDays);
    return end;
  });
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Check if user can access this listing
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const isPaid = !listing.isFree && parseFloat(listing.pricePerDay) > 0;

        // TODO: Restore tier check when re-enabling paid tiers (ENABLE_PAID_TIERS)
        if (ENABLE_PAID_TIERS && isPaid && user?.subscriptionTier !== 'plus' && !user?.isVerified && !isGracePeriodActive) {
          setAccessCheck({
            loading: false,
            canAccess: false,
            reason: 'subscription',
            requiredTier: 'plus',
          });
          return;
        }

        // Check subscription access for visibility level (town requires Plus)
        const result = await api.checkSubscriptionAccess(listing.visibility);
        if (!result.canAccess) {
          setAccessCheck({
            loading: false,
            canAccess: false,
            reason: 'subscription',
            requiredTier: result.requiredTier,
          });
          return;
        }

        // TODO: Restore verification gate when re-enabling paid tiers (ENABLE_PAID_TIERS)
        if (ENABLE_PAID_TIERS && (isPaid || listing.visibility === 'town') && !user?.isVerified && !isGracePeriodActive) {
          setAccessCheck({
            loading: false,
            canAccess: false,
            reason: 'verification',
          });
          return;
        }

        setAccessCheck({ loading: false, canAccess: true, reason: null });
      } catch (err) {
        // If check fails, allow the request and let backend handle it
        setAccessCheck({ loading: false, canAccess: true, reason: null });
      }
    };
    checkAccess();
  }, [listing.visibility, listing.isFree, user?.subscriptionTier, user?.isVerified, isGracePeriodActive]);

  const calculateDays = () => {
    return Math.round((Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) - Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) / 86400000);
  };

  const days = calculateDays();
  const rentalFee = listing.isFree ? 0 : (listing.pricePerDay * days);
  const total = rentalFee + listing.depositAmount;

  const handleStartDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (selectedDate) {
      setStartDate(selectedDate);
      setEndDate(current => clampEnd(current, selectedDate));
    }
  };

  const handleEndDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (selectedDate) {
      setEndDate(clampEnd(selectedDate, startDate));
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    });
  };

  const handleSubmit = async () => {
    if (!isGiveaway) {
      if (days < minDays || days > maxDays) {
        Alert.alert(
          'Adjust Your Dates',
          `This item can be borrowed for ${listing.minDuration}–${listing.maxDuration} days. Try picking a shorter or longer window.`
        );
        return;
      }
    }

    Keyboard.dismiss();
    setIsSubmitting(true);
    try {
      const result = await api.createTransaction({
        listingId: listing.id,
        salePrice: isSaleListing(listing) ? Number(listing.directFee.amount) : undefined,
        ...(isGiveaway ? {} : {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        message: message.trim() || undefined,
      });

      if (result.clientSecret) {
        // Paid rental — navigate to checkout to authorize payment
        navigation.replace('RentalCheckout', {
          transactionId: result.id,
          rentalFee,
          depositAmount: listing.depositAmount,
          totalAmount: total,
          rentalDays: days,
          listingTitle: listing.title,
          clientSecret: result.clientSecret,
          ephemeralKey: result.ephemeralKey,
          customerId: result.customerId,
        });
      } else {
        // Open the request tracker so the next step is immediately available.
        haptics.success();
        navigation.replace('TransactionDetail', { id: result.id });
      }
    } catch (error) {
      haptics.error();
      showError({
        message: error.message || 'Couldn\'t send your request right now. Please check your connection and try again.',
      });
    } finally {
      if (navigation.isFocused()) {
        setIsSubmitting(false);
      }
    }
  };

  // Show loading while checking access
  if (accessCheck.loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Show subscription upgrade prompt
  if (!accessCheck.canAccess && accessCheck.reason === 'subscription') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.promptContent}>
          {/* Item Preview */}
          <View style={[styles.cardBox, styles.promptItemCard]}>
            <ShimmerImage
              source={{ uri: listing.photos?.[0] || null }}
              style={styles.promptItemImage}
            />
            <View style={styles.promptItemInfo}>
              <Text style={styles.promptItemTitle}>{listing.title}</Text>
              <Text style={styles.promptItemOwner}>{listing.ownerMasked ? 'from a verified lender' : `from ${listing.owner.firstName}`}</Text>
            </View>
          </View>

          {/* Upgrade Card */}
          <View style={[styles.cardBox, styles.promptCard]}>
            <View style={styles.promptIconContainer}>
              <Ionicons name="star" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.promptTitle}>Verify to Unlock</Text>
            <Text style={styles.promptText}>
              {listing.isFree === false
                ? 'Paid rentals require verification. Verify to rent items from your neighbors.'
                : 'This item is shared town-wide. Verify to borrow from neighbors across your town.'}
            </Text>

            <View style={styles.promptBenefits}>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Everything in Free</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Request items shared with you</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Keep your inventory private</Text>
              </View>
            </View>

            <HapticPressable
              haptic="medium"
              style={styles.promptButton}
              onPress={() => navigation.navigate('Subscription')}
            >
              <Text style={styles.promptButtonText}>Verify & Unlock — $1.99</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.background} />
            </HapticPressable>
          </View>

          <HapticPressable
            haptic="light"
            style={styles.promptSecondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.promptSecondaryText}>Maybe Later</Text>
          </HapticPressable>
        </ScrollView>
      </View>
    );
  }

  // Show verification prompt for town-level items
  if (!accessCheck.canAccess && accessCheck.reason === 'verification') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.promptContent}>
          {/* Item Preview */}
          <View style={[styles.cardBox, styles.promptItemCard]}>
            <ShimmerImage
              source={{ uri: listing.photos?.[0] || null }}
              style={styles.promptItemImage}
            />
            <View style={styles.promptItemInfo}>
              <Text style={styles.promptItemTitle}>{listing.title}</Text>
              <Text style={styles.promptItemOwner}>{listing.ownerMasked ? 'from a verified lender' : `from ${listing.owner.firstName}`}</Text>
            </View>
          </View>

          {/* Verification Card */}
          <View style={[styles.cardBox, styles.promptCard]}>
            <View style={styles.promptIconContainer}>
              <Ionicons name="shield-checkmark" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.promptTitle}>Verify Your Identity</Text>
            <Text style={styles.promptText}>
              Town-wide sharing requires identity verification to keep everyone safe. This is a one-time process that only takes a minute.
            </Text>

            <View style={styles.promptBenefits}>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Request items explicitly shared with you</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Build trust with verified badge</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Quick and secure process</Text>
              </View>
            </View>

            <HapticPressable
              haptic="medium"
              style={styles.promptButton}
              onPress={() => navigation.navigate('IdentityVerification', { source: 'town_browse', totalSteps: 2 })}
            >
              <Text style={styles.promptButtonText}>Verify Now</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.background} />
            </HapticPressable>
          </View>

          <HapticPressable
            haptic="light"
            style={styles.promptSecondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.promptSecondaryText}>Maybe Later</Text>
          </HapticPressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      {/* Item Summary */}
      <View style={[styles.cardBox, styles.itemCard]}>
        <ShimmerImage
          source={{ uri: listing.photos?.[0] || null }}
          style={styles.itemImage}
        />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{listing.title}</Text>
          <Text style={styles.itemOwner}>
            {listing.ownerMasked ? 'from a verified lender' : `from ${listing.owner?.firstName || 'the owner'}${listing.owner?.lastName ? ` ${listing.owner.lastName}` : ''}`}
          </Text>
          {isGiveaway && (
            <View style={styles.giveawayBadge}>
              <Ionicons name={isSaleListing(listing) ? 'pricetag' : 'gift'} size={12} color={COLORS.secondary} />
              <Text style={styles.giveawayBadgeText}>{isSaleListing(listing) ? 'For sale — Yours to keep' : 'Giveaway — Yours to Keep'}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Dates — hidden for giveaways */}
      {!isGiveaway && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Borrow dates</Text>
        <Text style={styles.hint}>
          {listing.minDuration}-{listing.maxDuration} days allowed
        </Text>

        <View style={styles.dateRow}>
          <HapticPressable
            haptic="light"
            style={[styles.dateButton, showStartPicker && styles.dateButtonActive]}
            onPress={() => { Keyboard.dismiss(); setShowStartPicker(!showStartPicker); setShowEndPicker(false); }}
          >
            <Text style={styles.dateLabel}>Start Date</Text>
            <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
          </HapticPressable>
          <HapticPressable
            haptic="light"
            style={[styles.dateButton, showEndPicker && styles.dateButtonActive]}
            onPress={() => { Keyboard.dismiss(); setShowEndPicker(!showEndPicker); setShowStartPicker(false); }}
          >
            <Text style={styles.dateLabel}>End Date</Text>
            <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
          </HapticPressable>
        </View>

        {showStartPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant="light"
              textColor={COLORS.text}
              accentColor={COLORS.primary}
              style={{ width: '100%', backgroundColor: COLORS.surface }}
              minimumDate={new Date()}
              onChange={handleStartDateChange}
            />
            {Platform.OS === 'ios' && (
              <HapticPressable
                haptic="light"
                style={styles.pickerDoneButton}
                onPress={() => setShowStartPicker(false)}
              >
                <Text style={styles.pickerDoneText}>Done</Text>
              </HapticPressable>
            )}
          </View>
        )}

        {showEndPicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant="light"
              textColor={COLORS.text}
              accentColor={COLORS.primary}
              style={{ width: '100%', backgroundColor: COLORS.surface }}
              minimumDate={addDays(startDate, minDays)}
              maximumDate={addDays(startDate, maxDays)}
              onChange={handleEndDateChange}
            />
            {Platform.OS === 'ios' && (
              <HapticPressable
                haptic="light"
                style={styles.pickerDoneButton}
                onPress={() => setShowEndPicker(false)}
              >
                <Text style={styles.pickerDoneText}>Done</Text>
              </HapticPressable>
            )}
          </View>
        )}

        <Text style={styles.daysText}>{days} {days === 1 ? 'day' : 'days'}</Text>
      </View>
      )}

      {/* Message */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Private message (optional)</Text>
        <Text style={styles.hint}>Sent privately to the owner with this request.</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          accessibilityLabel="Private message to owner"
          value={message}
          onChangeText={setMessage}
          onFocus={() => { setShowStartPicker(false); setShowEndPicker(false); }}
          placeholder="Introduce yourself and explain what you need the item for..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          numberOfLines={4}
          maxLength={500}
          autoCapitalize="sentences"
          autoCorrect={true}
          spellCheck={true}
        />
      </View>

      {listing.directFee && <View style={styles.section}>
        <Text style={{ color: COLORS.text }}>{directFeeLabel(listing)}</Text>
        <Text style={{ color: COLORS.textSecondary }}>Agree on payment directly with your neighbor before pickup. Borrowhood does not collect or process this fee.</Text>
      </View>}
      {/* Pricing — hidden for giveaways and free rentals */}
      {!isGiveaway && total > 0 && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Summary</Text>
        <View style={styles.pricingCard}>
          {days > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>
                Rental fee ({days} days x ${listing.pricePerDay})
              </Text>
              <Text style={styles.priceValue}>${rentalFee.toFixed(2)}</Text>
            </View>
          )}
          {listing.depositAmount > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Refundable deposit</Text>
              <Text style={styles.priceValue}>${listing.depositAmount.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total authorization hold</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.gray[400]} />
          <Text style={[styles.depositNote, { flex: 1 }]}>Deposit is refunded when you return the item in good condition</Text>
        </View>
      </View>
      )}

      <Text style={styles.termsText}>
        {isGiveaway
          ? 'By requesting this item, you agree to our terms and conditions'
          : 'By sending this request, you agree to our borrowing terms and conditions'}
      </Text>
    </ScrollView>
    <View style={[styles.submitFooter, { paddingBottom: keyboardVisible ? SPACING.md : Math.max(insets.bottom, SPACING.md) }]}>
      {/* Submit stays above the keyboard so no dismissal toolbar is needed. */}
      <HapticPressable
        haptic="medium"
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>
            {isSaleListing(listing) ? 'Request to Buy' : isGiveaway ? 'Request Item' : total > 0 ? `Request & Pay $${total.toFixed(2)}` : 'Send Request'}
          </Text>
        )}
      </HapticPressable>
    </View>
    </KeyboardAvoidingView>
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
  promptContent: {
    padding: SPACING.xl,
    paddingBottom: 40,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  promptItemCard: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  promptItemImage: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[700],
  },
  promptItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  promptItemTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  promptItemOwner: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  promptCard: {
    padding: SPACING.xl,
  },
  promptIconContainer: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  promptTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  promptText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  promptBenefits: {
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  promptBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promptBenefitText: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 14,
    color: COLORS.text,
  },
  promptButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  promptButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: COLORS.background,
  },
  promptSecondaryButton: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.md,
  },
  promptSecondaryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  content: {
    padding: SPACING.xl,
  },
  itemCard: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[200],
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  itemOwner: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  giveawayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
  },
  giveawayBadgeText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.secondary,
    fontWeight: '600',
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  hint: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  dateRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  dateButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  dateButtonActive: {
    borderColor: COLORS.primary,
  },
  pickerContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  pickerDoneButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  pickerDoneText: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.primary,
  },
  dateLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  dateValue: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  daysText: {
    textAlign: 'center',
    ...TYPOGRAPHY.bodySmall,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: SPACING.md,
  },
  messageInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  pricingCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.primaryMuted,
    borderWidth: 1.5,
    borderColor: COLORS.borderGreen,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  priceLabel: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  priceValue: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 14,
    color: COLORS.primary,
  },
  totalRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    marginBottom: 0,
  },
  totalLabel: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.primary,
  },
  totalValue: {
    ...TYPOGRAPHY.h3,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  depositNote: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  submitFooter: {
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
    fontSize: 16,
  },
  termsText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
});
import { ThemedAlert as Alert } from "../components/ThemedAlert";
