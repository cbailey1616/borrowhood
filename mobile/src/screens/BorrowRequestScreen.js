import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function BorrowRequestScreen({ route, navigation }) {
  const { listing } = route.params;
  const { user } = useAuth();
  const { showError } = useError();
  const [accessCheck, setAccessCheck] = useState({ loading: true, canAccess: true, reason: null });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(() => {
    const end = new Date(tomorrow);
    end.setDate(end.getDate() + listing.minDuration);
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

        // Paid rentals require Plus for both renter and owner
        if (isPaid && user?.subscriptionTier !== 'plus') {
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

        // Paid rentals and town-level items require verification
        if ((isPaid || listing.visibility === 'town') && !user?.isVerified) {
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
  }, [listing.visibility, listing.isFree, user?.subscriptionTier, user?.isVerified]);

  const calculateDays = () => {
    return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  };

  const days = calculateDays();
  const rentalFee = listing.isFree ? 0 : (listing.pricePerDay * days);
  const total = rentalFee + listing.depositAmount;

  const handleStartDateChange = (event, selectedDate) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setStartDate(selectedDate);
      // Ensure end date is after start date
      if (selectedDate >= endDate) {
        const newEnd = new Date(selectedDate);
        newEnd.setDate(newEnd.getDate() + listing.minDuration);
        setEndDate(newEnd);
      }
    }
  };

  const handleEndDateChange = (event, selectedDate) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate && selectedDate > startDate) {
      setEndDate(selectedDate);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleSubmit = async () => {
    if (days < listing.minDuration || days > listing.maxDuration) {
      showError({
        type: 'validation',
        title: 'Adjust Your Dates',
        message: `This item can be borrowed for ${listing.minDuration}–${listing.maxDuration} days. Try picking a shorter or longer window.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.createTransaction({
        listingId: listing.id,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
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
        // Free rental — request sent, go back
        haptics.success();
        navigation.goBack();
      }
    } catch (error) {
      haptics.error();
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('verification')) {
        showError({
          type: 'verification',
          title: 'Verify Your Identity',
          message: 'Town listings require identity verification for everyone\'s safety. It only takes a minute.',
          primaryLabel: 'Verify Now',
          onPrimaryPress: () => navigation.navigate('IdentityVerification'),
        });
      } else if (msg.includes('payment method')) {
        showError({
          title: 'Add a Payment Method',
          message: 'You\'ll need a card on file to request paid rentals. Your card won\'t be charged until the lender approves.',
          primaryLabel: 'Add Card',
          onPrimaryPress: () => navigation.navigate('AddPaymentMethod'),
        });
      } else {
        showError({
          message: error.message || 'Couldn\'t send your request right now. Please check your connection and try again.',
        });
      }
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
          <BlurCard style={styles.promptItemCard}>
            <Image
              source={{ uri: listing.photos?.[0] || 'https://via.placeholder.com/80' }}
              style={styles.promptItemImage}
            />
            <View style={styles.promptItemInfo}>
              <Text style={styles.promptItemTitle}>{listing.title}</Text>
              <Text style={styles.promptItemOwner}>{listing.ownerMasked ? 'from a verified lender' : `from ${listing.owner.firstName}`}</Text>
            </View>
          </BlurCard>

          {/* Upgrade Card */}
          <BlurCard style={styles.promptCard}>
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
                <Text style={styles.promptBenefitText}>Borrow from anyone in town</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Charge rental fees</Text>
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
          </BlurCard>

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
          <BlurCard style={styles.promptItemCard}>
            <Image
              source={{ uri: listing.photos?.[0] || 'https://via.placeholder.com/80' }}
              style={styles.promptItemImage}
            />
            <View style={styles.promptItemInfo}>
              <Text style={styles.promptItemTitle}>{listing.title}</Text>
              <Text style={styles.promptItemOwner}>{listing.ownerMasked ? 'from a verified lender' : `from ${listing.owner.firstName}`}</Text>
            </View>
          </BlurCard>

          {/* Verification Card */}
          <BlurCard style={styles.promptCard}>
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
                <Text style={styles.promptBenefitText}>Borrow from anyone in your town</Text>
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
          </BlurCard>

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Item Summary */}
      <BlurCard style={styles.itemCard}>
        <Image
          source={{ uri: listing.photos?.[0] || 'https://via.placeholder.com/60' }}
          style={styles.itemImage}
        />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{listing.title}</Text>
          <Text style={styles.itemOwner}>
            {listing.ownerMasked ? 'from a verified lender' : `from ${listing.owner.firstName} ${listing.owner.lastName[0]}.`}
          </Text>
        </View>
      </BlurCard>

      {/* Dates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rental Period</Text>
        <Text style={styles.hint}>
          {listing.minDuration}-{listing.maxDuration} days allowed
        </Text>

        <View style={styles.dateRow}>
          <HapticPressable
            haptic="light"
            style={styles.dateButton}
            onPress={() => setShowStartPicker(true)}
          >
            <Text style={styles.dateLabel}>Start Date</Text>
            <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
          </HapticPressable>
          <HapticPressable
            haptic="light"
            style={styles.dateButton}
            onPress={() => setShowEndPicker(true)}
          >
            <Text style={styles.dateLabel}>End Date</Text>
            <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
          </HapticPressable>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={handleStartDateChange}
          />
        )}

        {showEndPicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date(startDate.getTime() + 86400000)}
            onChange={handleEndDateChange}
          />
        )}

        <Text style={styles.daysText}>{days} days</Text>
      </View>

      {/* Message */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Message (optional)</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="Introduce yourself and explain what you need the item for..."
          multiline
          numberOfLines={4}
          maxLength={500}
        />
      </View>

      {/* Pricing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Summary</Text>
        <BlurCard style={styles.pricingCard}>
          {!listing.isFree && days > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>
                Rental fee ({days} days x ${listing.pricePerDay})
              </Text>
              <Text style={styles.priceValue}>${rentalFee.toFixed(2)}</Text>
            </View>
          )}
          {listing.isFree && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Rental fee</Text>
              <Text style={[styles.priceValue, { color: COLORS.secondary }]}>Free</Text>
            </View>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Refundable deposit</Text>
            <Text style={styles.priceValue}>${listing.depositAmount.toFixed(2)}</Text>
          </View>
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total authorization hold</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </BlurCard>
        <Text style={styles.depositNote}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.gray[400]} />
          {' '}Deposit is refunded when you return the item in good condition
        </Text>
      </View>

      {/* Submit */}
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
            {total > 0 ? `Request & Pay $${total.toFixed(2)}` : 'Send Request'}
          </Text>
        )}
      </HapticPressable>

      <Text style={styles.termsText}>
        By sending this request, you agree to our borrowing terms and conditions
      </Text>
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
    backgroundColor: COLORS.background,
  },
  promptContent: {
    padding: SPACING.xl,
    paddingBottom: 40,
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
    color: COLORS.text,
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
    color: COLORS.text,
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
    marginBottom: SPACING.xxl,
  },
});
