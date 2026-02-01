import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../utils/config';

export default function BorrowRequestScreen({ route, navigation }) {
  const { listing } = route.params;
  const { user } = useAuth();
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

  // Check if user can access this listing's visibility level
  useEffect(() => {
    const checkAccess = async () => {
      try {
        // Check subscription access for this visibility level
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

        // Check if verification is required (town-level items)
        if (listing.visibility === 'town' && user?.status !== 'verified') {
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
  }, [listing.visibility, user?.status]);

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
      Alert.alert('Error', `Duration must be between ${listing.minDuration} and ${listing.maxDuration} days`);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createTransaction({
        listingId: listing.id,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        message: message.trim() || undefined,
      });

      Alert.alert(
        'Request Sent!',
        `${listing.owner.firstName} will be notified of your request.`,
        [{ text: 'OK', onPress: () => navigation.navigate('Activity') }]
      );
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
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
    const tierName = accessCheck.requiredTier === 'town' ? 'Town' : 'Neighborhood';
    const tierPrice = accessCheck.requiredTier === 'town' ? '$10' : '$5';
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.promptContent}>
          {/* Item Preview */}
          <View style={styles.promptItemCard}>
            <Image
              source={{ uri: listing.photos?.[0] || 'https://via.placeholder.com/80' }}
              style={styles.promptItemImage}
            />
            <View style={styles.promptItemInfo}>
              <Text style={styles.promptItemTitle}>{listing.title}</Text>
              <Text style={styles.promptItemOwner}>from {listing.owner.firstName}</Text>
            </View>
          </View>

          {/* Upgrade Card */}
          <View style={styles.promptCard}>
            <View style={styles.promptIconContainer}>
              <Ionicons name="trending-up" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.promptTitle}>Upgrade to {tierName}</Text>
            <Text style={styles.promptText}>
              This item is shared with the {tierName.toLowerCase()} community. Upgrade your plan to borrow from more neighbors and access exclusive items.
            </Text>

            <View style={styles.promptBenefits}>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Borrow from {tierName.toLowerCase()} listings</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Share your items with more people</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Only {tierPrice}/month</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.promptButton}
              onPress={() => navigation.navigate('Subscription')}
            >
              <Text style={styles.promptButtonText}>View Plans</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.background} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.promptSecondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.promptSecondaryText}>Maybe Later</Text>
          </TouchableOpacity>
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
          <View style={styles.promptItemCard}>
            <Image
              source={{ uri: listing.photos?.[0] || 'https://via.placeholder.com/80' }}
              style={styles.promptItemImage}
            />
            <View style={styles.promptItemInfo}>
              <Text style={styles.promptItemTitle}>{listing.title}</Text>
              <Text style={styles.promptItemOwner}>from {listing.owner.firstName}</Text>
            </View>
          </View>

          {/* Verification Card */}
          <View style={styles.promptCard}>
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

            <TouchableOpacity
              style={styles.promptButton}
              onPress={() => navigation.navigate('Auth', { screen: 'VerifyIdentity' })}
            >
              <Text style={styles.promptButtonText}>Verify Now</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.background} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.promptSecondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.promptSecondaryText}>Maybe Later</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Item Summary */}
      <View style={styles.itemCard}>
        <Image
          source={{ uri: listing.photos?.[0] || 'https://via.placeholder.com/60' }}
          style={styles.itemImage}
        />
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{listing.title}</Text>
          <Text style={styles.itemOwner}>
            from {listing.owner.firstName} {listing.owner.lastName[0]}.
          </Text>
        </View>
      </View>

      {/* Dates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rental Period</Text>
        <Text style={styles.hint}>
          {listing.minDuration}-{listing.maxDuration} days allowed
        </Text>

        <View style={styles.dateRow}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowStartPicker(true)}
          >
            <Text style={styles.dateLabel}>Start Date</Text>
            <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowEndPicker(true)}
          >
            <Text style={styles.dateLabel}>End Date</Text>
            <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
          </TouchableOpacity>
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
        <View style={styles.pricingCard}>
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
            <Text style={styles.totalLabel}>Total due at approval</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>
        <Text style={styles.depositNote}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.gray[400]} />
          {' '}Deposit is refunded when you return the item in good condition
        </Text>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Send Request</Text>
        )}
      </TouchableOpacity>

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
    padding: 20,
    paddingBottom: 40,
  },
  promptItemCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  promptItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: COLORS.gray[700],
  },
  promptItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  promptItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  promptItemOwner: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  promptCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  promptIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  promptTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  promptText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  promptBenefits: {
    gap: 12,
    marginBottom: 24,
  },
  promptBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promptBenefitText: {
    fontSize: 14,
    color: COLORS.text,
  },
  promptButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  promptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  promptSecondaryButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
  promptSecondaryText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  content: {
    padding: 20,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 24,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: COLORS.gray[200],
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemOwner: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  dateLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  daysText: {
    textAlign: 'center',
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: 12,
  },
  messageInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  pricingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  depositNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
  },
});
