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
import { COLORS } from '../utils/config';
import api from '../services/api';

export default function SubscriptionScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
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
          { tier: 'free', name: 'Friends', priceCents: 0, priceDisplay: 'Free', description: 'Share with your friends', features: ['Lend to your friends', 'Borrow from your friends', 'Free items only'] },
          { tier: 'neighborhood', name: 'Neighborhood', priceCents: 100, priceDisplay: '$1/mo', description: 'Share with your neighborhood', features: ['Everything in Friends', 'Lend to your neighborhood', 'Borrow from your neighborhood', 'Charge rental fees'] },
          { tier: 'town', name: 'Town', priceCents: 200, priceDisplay: '$2/mo', description: 'Share with your whole town', features: ['Everything in Neighborhood', 'Lend to your town', 'Borrow from your town', 'Featured listings'] },
        ]);
      }
    } catch (err) {
      console.error('Load subscription data error:', err);
      Alert.alert('Error', err.message || 'Failed to load subscription info');
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

    // Check if upgrading from paid tier
    if (currentSub?.tier !== 'free' && tier.tier === 'town') {
      Alert.alert(
        'Upgrade to Town',
        `Upgrade to Town tier for ${tier.priceDisplay}? You'll be charged a prorated amount.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => handleUpgrade(tier.tier) },
        ]
      );
      return;
    }

    // New subscription - need payment method
    navigation.navigate('PaymentMethods', {
      onSelectMethod: (paymentMethodId) => handleSubscribe(tier.tier, paymentMethodId),
      selectMode: true,
    });
  };

  const handleSubscribe = async (tier, paymentMethodId) => {
    setSubscribing(true);
    try {
      await api.subscribe(tier, paymentMethodId);
      await loadData();
      await refreshUser();
      Alert.alert('Success', `Welcome to the ${tier} tier!`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to subscribe');
    } finally {
      setSubscribing(false);
    }
  };

  const handleUpgrade = async (tier) => {
    setSubscribing(true);
    try {
      await api.upgradeSubscription(tier);
      await loadData();
      await refreshUser();
      Alert.alert('Success', `Upgraded to ${tier} tier!`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to upgrade');
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
              Alert.alert('Error', err.message || 'Failed to cancel');
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
          const isDowngrade = currentSub?.tier === 'town' && tier.tier !== 'town';
          const isUpgrade = currentSub?.tier === 'neighborhood' && tier.tier === 'town';

          return (
            <TouchableOpacity
              key={tier.tier}
              style={[
                styles.tierCard,
                isCurrentTier && styles.tierCardCurrent,
                tier.tier === 'town' && styles.tierCardFeatured,
              ]}
              onPress={() => handleSelectTier(tier)}
              disabled={subscribing || isCurrentTier}
            >
              {tier.tier === 'town' && (
                <View style={styles.featuredBadge}>
                  <Text style={styles.featuredBadgeText}>BEST VALUE</Text>
                </View>
              )}

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
                tier.tier === 'town' && !isCurrentTier && styles.tierButtonFeatured,
              ]}>
                <Text style={[
                  styles.tierButtonText,
                  isCurrentTier && styles.tierButtonTextCurrent,
                ]}>
                  {isCurrentTier
                    ? 'Current Plan'
                    : isUpgrade
                    ? 'Upgrade'
                    : isDowngrade
                    ? 'Downgrade'
                    : tier.priceCents === 0
                    ? 'Start Free'
                    : 'Subscribe'}
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
