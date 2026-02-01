import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { COLORS } from '../utils/config';
import api from '../services/api';

export default function SubscriptionScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const { showError } = useError();
  const [tiers, setTiers] = useState([]);
  const [currentSub, setCurrentSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tiersRes, subRes] = await Promise.all([
        api.getSubscriptionTiers().catch(e => {
          console.log('Failed to load tiers:', e);
          return [];
        }),
        api.getCurrentSubscription().catch(e => {
          console.log('Failed to load current subscription:', e);
          return { tier: 'free', features: [] };
        }),
      ]);
      setTiers(tiersRes || []);
      setCurrentSub(subRes || { tier: 'free', features: [] });

      // If no tiers from API, show default tiers
      if (!tiersRes || tiersRes.length === 0) {
        setTiers([
          { tier: 'free', name: 'Free', priceCents: 0, priceDisplay: 'Free', description: 'Share with friends and neighbors', features: ['Borrow from friends', 'Borrow from your neighborhood', 'List items for free'] },
          { tier: 'plus', name: 'Plus', priceCents: 100, priceDisplay: '$1/mo', description: 'Unlock your whole town', features: ['Everything in Free', 'Borrow from anyone in town', 'Charge rental fees'] },
        ]);
      }
    } catch (err) {
      console.error('Load subscription data error:', err);
      showError({
        message: err.message || 'Unable to load subscription information. Please check your connection and try again.',
        type: 'network',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTier = async (tier) => {
    if (tier.tier === currentSub?.tier) return;
    if (tier.tier === 'free') {
      handleCancel();
      return;
    }

    // Plus requires verification
    if (!user?.isVerified) {
      showError({
        type: 'verification',
        title: 'Verification Required',
        message: 'Plus requires identity verification to unlock town features and rental payments.',
        primaryAction: 'Verify Now',
        onPrimaryAction: () => navigation.navigate('Auth', { screen: 'VerifyIdentity' }),
      });
      return;
    }

    // New subscription to Plus - need payment method
    navigation.navigate('PaymentMethods', {
      onSelectMethod: (paymentMethodId) => handleSubscribe(paymentMethodId),
      selectMode: true,
    });
  };

  const handleSubscribe = async (paymentMethodId) => {
    setSubscribing(true);
    try {
      await api.subscribe(paymentMethodId);
      await loadData();
      await refreshUser();
      Alert.alert('Success', 'Welcome to Borrowhood Plus!');
    } catch (err) {
      if (err.code === 'VERIFICATION_REQUIRED') {
        showError({
          type: 'verification',
          title: 'Verification Required',
          message: 'Plus requires identity verification to unlock town features and rental payments.',
          primaryAction: 'Verify Now',
          onPrimaryAction: () => navigation.navigate('Auth', { screen: 'VerifyIdentity' }),
        });
      } else {
        showError({
          message: err.message || 'Unable to complete subscription. Please check your payment method and try again.',
          type: 'network',
        });
      }
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancel = () => {
    if (currentSub?.tier === 'free') return;

    Alert.alert(
      'Cancel Subscription',
      'Your subscription will remain active until the end of the billing period. After that, you\'ll be downgraded to the Free tier.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            setSubscribing(true);
            try {
              const result = await api.cancelSubscription();
              await loadData();
              Alert.alert(
                'Subscription Cancelled',
                `Your subscription will end on ${new Date(result.expiresAt).toLocaleDateString()}`
              );
            } catch (err) {
              showError({
                message: err.message || 'Unable to cancel subscription. Please try again or contact support.',
                type: 'network',
              });
            } finally {
              setSubscribing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>
          Expand your sharing circle and unlock more features
        </Text>
      </View>

      {currentSub?.expiresAt && (
        <View style={styles.expiryBanner}>
          <Text style={styles.expiryText}>
            Your subscription ends on {new Date(currentSub.expiresAt).toLocaleDateString()}
          </Text>
        </View>
      )}

      <View style={styles.tiersContainer}>
        {tiers.map((tier) => {
          const isCurrentTier = tier.tier === currentSub?.tier;
          const isPlus = tier.tier === 'plus';

          return (
            <TouchableOpacity
              key={tier.tier}
              style={[
                styles.tierCard,
                isCurrentTier && styles.tierCardCurrent,
                isPlus && styles.tierCardFeatured,
              ]}
              onPress={() => handleSelectTier(tier)}
              disabled={subscribing || isCurrentTier}
            >
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={styles.tierPrice}>{tier.priceDisplay}</Text>
              <Text style={styles.tierDescription}>{tier.description}</Text>

              <View style={styles.featuresContainer}>
                {tier.features?.map((feature, idx) => (
                  <View key={idx} style={styles.featureRow}>
                    <Text style={styles.featureCheck}>✓</Text>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              <View style={[
                styles.tierButton,
                isCurrentTier && styles.tierButtonCurrent,
                isPlus && !isCurrentTier && styles.tierButtonFeatured,
              ]}>
                <Text style={[
                  styles.tierButtonText,
                  isCurrentTier && styles.tierButtonTextCurrent,
                ]}>
                  {isCurrentTier
                    ? 'Current Plan'
                    : tier.priceCents === 0
                    ? 'Start Free'
                    : 'Get Plus'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {currentSub?.tier !== 'free' && !currentSub?.expiresAt && (
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Subscriptions are billed monthly. Cancel anytime.
        </Text>
        <Text style={styles.footerText}>
          Need help? Contact support@borrowhood.com
        </Text>
      </View>

      {subscribing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.overlayText}>Processing...</Text>
        </View>
      )}
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
  header: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  expiryBanner: {
    backgroundColor: COLORS.warning + '20',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  expiryText: {
    color: COLORS.warning,
    textAlign: 'center',
    fontSize: 14,
  },
  tiersContainer: {
    paddingHorizontal: 16,
    gap: 16,
  },
  tierCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: COLORS.gray[700],
  },
  tierCardCurrent: {
    borderColor: COLORS.primary,
  },
  tierCardFeatured: {
    borderColor: COLORS.primary,
  },
  featuredBadge: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: [{ translateX: -40 }],
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  featuredBadgeText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '700',
  },
  tierName: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  tierPrice: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 8,
  },
  tierDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  featuresContainer: {
    gap: 12,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureCheck: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  tierButton: {
    backgroundColor: COLORS.gray[700],
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tierButtonCurrent: {
    backgroundColor: COLORS.primary + '20',
  },
  tierButtonFeatured: {
    backgroundColor: COLORS.primary,
  },
  tierButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  tierButtonTextCurrent: {
    color: COLORS.primary,
  },
  cancelButton: {
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.danger,
    fontSize: 16,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background + 'E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: COLORS.text,
    marginTop: 12,
    fontSize: 16,
  },
});
