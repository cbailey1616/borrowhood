import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import ActionSheet from '../components/ActionSheet';
import SkeletonShape from '../components/SkeletonLoader';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const CARD_BRANDS = {
  visa: {
    label: 'Visa',
    icon: 'card',
    colors: ['#1A1F71', '#2E3BC5'],
  },
  mastercard: {
    label: 'Mastercard',
    icon: 'card',
    colors: ['#EB001B', '#F79E1B'],
  },
  amex: {
    label: 'American Express',
    icon: 'card',
    colors: ['#006FCF', '#00A4E4'],
  },
  discover: {
    label: 'Discover',
    icon: 'card',
    colors: ['#FF6600', '#FFB347'],
  },
  default: {
    label: 'Card',
    icon: 'card-outline',
    colors: [COLORS.gray[700], COLORS.gray[600]],
  },
};

function getBrand(brand) {
  return CARD_BRANDS[brand?.toLowerCase()] || CARD_BRANDS.default;
}

function CreditCardVisual({ card, compact }) {
  const brand = getBrand(card.brand);
  const dots = '\u2022\u2022\u2022\u2022';

  if (compact) {
    return (
      <LinearGradient
        colors={brand.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.miniCard}
      >
        <Text style={styles.miniCardNumber}>{dots} {card.last4}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={brand.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.cardVisual}
    >
      <View style={styles.cardVisualTop}>
        <Ionicons name="wifi" size={20} color="rgba(255,255,255,0.6)" style={{ transform: [{ rotate: '90deg' }] }} />
        {card.isDefault && (
          <View style={styles.defaultChip}>
            <Text style={styles.defaultChipText}>Default</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardVisualNumber}>
        {dots}  {dots}  {dots}  {card.last4}
      </Text>
      <View style={styles.cardVisualBottom}>
        <View>
          <Text style={styles.cardVisualLabel}>EXPIRES</Text>
          <Text style={styles.cardVisualValue}>
            {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
          </Text>
        </View>
        <Text style={styles.cardVisualBrand}>{brand.label}</Text>
      </View>
    </LinearGradient>
  );
}

function CardSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonShape width="100%" height={180} borderRadius={RADIUS.xl} />
      <View style={{ marginTop: SPACING.sm }}>
        <SkeletonShape width="100%" height={180} borderRadius={RADIUS.xl} style={{ opacity: 0.5 }} />
      </View>
    </View>
  );
}

export default function PaymentMethodsScreen({ navigation, route }) {
  const selectMode = route.params?.selectMode || false;
  const onSelectMethod = route.params?.onSelectMethod;
  const { showError } = useError();
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [connectStatus, setConnectStatus] = useState(null);

  useFocusEffect(
    useCallback(() => {
      fetchPaymentMethods();
      if (!selectMode) loadConnectStatus();
    }, [])
  );

  const loadConnectStatus = async () => {
    try {
      const status = await api.getConnectStatus();
      setConnectStatus(status);
    } catch (error) {
      // Silently fail — payout section will show setup prompt
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const data = await api.getPaymentMethods();
      setPaymentMethods(data || []);
    } catch (error) {
      setPaymentMethods([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPaymentMethods();
    if (!selectMode) loadConnectStatus();
  };

  const handleAddCard = () => {
    navigation.navigate('AddPaymentMethod');
  };

  const handleRemoveCard = async () => {
    if (!selectedCard) return;
    try {
      await api.removePaymentMethod(selectedCard.id);
      setPaymentMethods(prev => prev.filter(c => c.id !== selectedCard.id));
      haptics.success();
    } catch (error) {
      haptics.error();
      showError({
        message: 'Couldn\'t remove this card right now. Please check your connection and try again.',
        type: 'network',
      });
    }
  };

  const handleSetDefault = async (card) => {
    try {
      await api.setDefaultPaymentMethod(card.id);
      setPaymentMethods(prev =>
        prev.map(c => ({ ...c, isDefault: c.id === card.id }))
      );
      haptics.success();
    } catch (error) {
      haptics.error();
      showError({
        message: 'Couldn\'t update your default card right now. Please check your connection and try again.',
        type: 'network',
      });
    }
  };

  const handleCardLongPress = (card) => {
    if (selectMode) return;
    setSelectedCard(card);
    setActionSheetVisible(true);
  };

  const getCardActions = () => {
    if (!selectedCard) return [];
    const actions = [];
    if (!selectedCard.isDefault) {
      actions.push({
        label: 'Set as Default',
        icon: 'star-outline',
        onPress: () => handleSetDefault(selectedCard),
      });
    }
    actions.push({
      label: 'Remove Card',
      icon: 'trash-outline',
      destructive: true,
      onPress: handleRemoveCard,
    });
    return actions;
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Cards</Text>
            <CardSkeleton />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Cards Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Cards</Text>

          {paymentMethods.length > 0 ? (
            <View style={styles.cardList}>
              {paymentMethods.map((card) => (
                <HapticPressable
                  key={card.id}
                  haptic="light"
                  onPress={() => {
                    if (selectMode) {
                      setSelectedId(card.id);
                    }
                  }}
                  onLongPress={() => handleCardLongPress(card)}
                  disabled={!selectMode && false}
                >
                  {selectMode && (
                    <View style={styles.selectIndicator}>
                      <Ionicons
                        name={selectedId === card.id ? 'checkmark-circle' : 'ellipse-outline'}
                        size={24}
                        color={selectedId === card.id ? COLORS.primary : COLORS.gray[500]}
                      />
                    </View>
                  )}
                  <CreditCardVisual card={card} />
                  {!selectMode && (
                    <View style={styles.cardActions}>
                      {card.isDefault ? (
                        <View style={styles.defaultBadge}>
                          <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                          <Text style={styles.defaultBadgeText}>Default payment method</Text>
                        </View>
                      ) : (
                        <HapticPressable
                          haptic="light"
                          style={styles.setDefaultRow}
                          onPress={() => handleSetDefault(card)}
                        >
                          <Ionicons name="ellipse-outline" size={14} color={COLORS.textSecondary} />
                          <Text style={styles.setDefaultText}>Tap to set as default</Text>
                        </HapticPressable>
                      )}
                      <HapticPressable
                        haptic="light"
                        style={styles.moreButton}
                        onPress={() => handleCardLongPress(card)}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSecondary} />
                      </HapticPressable>
                    </View>
                  )}
                </HapticPressable>
              ))}
            </View>
          ) : (
            <BlurCard style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="card-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyText}>No payment methods yet</Text>
              <Text style={styles.emptySubtext}>
                Add a card to start borrowing items with rental fees
              </Text>
            </BlurCard>
          )}

          <HapticPressable haptic="medium" style={styles.addButton} onPress={handleAddCard}>
            <View style={styles.addButtonIcon}>
              <Ionicons name="add" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.addButtonText}>Add Payment Method</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </HapticPressable>
        </View>

        {/* Security Note */}
        <View style={styles.securityRow}>
          <Ionicons name="lock-closed" size={13} color={COLORS.textMuted} />
          <Text style={styles.securityText}>
            Card details are securely stored by Stripe. We never see your full card number.
          </Text>
        </View>

        {/* Payout Section */}
        {!selectMode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Earn Money</Text>

            {connectStatus?.chargesEnabled && connectStatus?.payoutsEnabled ? (
              <BlurCard style={styles.payoutCard}>
                <View style={styles.payoutIconWrap}>
                  <Ionicons name="checkmark-circle" size={28} color={COLORS.primary} />
                </View>
                <View style={styles.payoutInfo}>
                  <Text style={styles.payoutTitle}>Payouts Active</Text>
                  <Text style={styles.payoutSubtext}>
                    You'll receive payments when others borrow your items. Funds are deposited to your bank account.
                  </Text>
                </View>
              </BlurCard>
            ) : connectStatus?.detailsSubmitted ? (
              <BlurCard style={styles.payoutCard}>
                <View style={[styles.payoutIconWrap, styles.payoutPendingIcon]}>
                  <Ionicons name="time" size={28} color="#F5A623" />
                </View>
                <View style={styles.payoutInfo}>
                  <Text style={styles.payoutTitle}>Verification in Progress</Text>
                  <Text style={styles.payoutSubtext}>
                    Stripe is reviewing your payout account. This usually takes just a few minutes.
                  </Text>
                </View>
              </BlurCard>
            ) : (
              <HapticPressable
                haptic="medium"
                onPress={() => navigation.navigate('SetupPayout')}
              >
                <BlurCard style={styles.payoutSetupCard}>
                  <View style={styles.payoutSetupContent}>
                    <View style={[styles.payoutIconWrap, styles.payoutSetupIcon]}>
                      <Ionicons name="wallet-outline" size={28} color={COLORS.primary} />
                    </View>
                    <View style={styles.payoutInfo}>
                      <Text style={styles.payoutTitle}>Set Up Payouts</Text>
                      <Text style={styles.payoutSubtext}>
                        Connect a bank account to earn money when people borrow your items.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.payoutSetupAction}>
                    <Text style={styles.payoutSetupActionText}>Get Started</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                  </View>
                </BlurCard>
              </HapticPressable>
            )}
          </View>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* Select mode footer */}
      {selectMode && selectedId && (
        <View style={styles.selectFooter}>
          <HapticPressable
            haptic="medium"
            style={styles.selectButton}
            onPress={() => {
              onSelectMethod?.(selectedId);
              navigation.goBack();
            }}
          >
            <Text style={styles.selectButtonText}>Use This Card</Text>
          </HapticPressable>
        </View>
      )}

      {/* Card action sheet */}
      <ActionSheet
        isVisible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title={selectedCard ? `${getBrand(selectedCard.brand).label} \u2022\u2022\u2022\u2022 ${selectedCard.last4}` : 'Card Options'}
        actions={getCardActions()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xxl,
  },
  section: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  sectionTitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Card list
  cardList: {
    gap: SPACING.lg,
  },
  // Credit card visual
  cardVisual: {
    height: 190,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    justifyContent: 'space-between',
  },
  cardVisualTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  defaultChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  defaultChipText: {
    ...TYPOGRAPHY.caption1,
    color: '#fff',
    fontWeight: '600',
  },
  cardVisualNumber: {
    ...TYPOGRAPHY.body,
    color: '#fff',
    fontSize: 18,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  cardVisualBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardVisualLabel: {
    ...TYPOGRAPHY.caption1,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardVisualValue: {
    ...TYPOGRAPHY.body,
    color: '#fff',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  cardVisualBrand: {
    ...TYPOGRAPHY.headline,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
    fontSize: 18,
  },
  // Mini card (select mode)
  miniCard: {
    height: 44,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
  },
  miniCardNumber: {
    ...TYPOGRAPHY.body,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 1,
  },
  // Card actions row
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  defaultBadgeText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.primary,
    fontWeight: '500',
  },
  setDefaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  setDefaultText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  moreButton: {
    padding: SPACING.sm,
  },
  // Select indicator
  selectIndicator: {
    alignItems: 'flex-end',
    marginBottom: SPACING.xs,
  },
  // Empty state
  emptyCard: {
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    maxWidth: 260,
  },
  // Add button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  addButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
  },
  // Security note
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  securityText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    flex: 1,
  },
  // Payout section
  payoutCard: {
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.md,
    alignItems: 'center',
  },
  payoutIconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutPendingIcon: {
    backgroundColor: '#F5A62315',
  },
  payoutSetupIcon: {
    backgroundColor: COLORS.primary + '15',
  },
  payoutInfo: {
    flex: 1,
  },
  payoutTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  payoutSubtext: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  payoutSetupCard: {
    padding: SPACING.lg,
  },
  payoutSetupContent: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  payoutSetupAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  payoutSetupActionText: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.primary,
    fontWeight: '600',
  },
  // Skeleton
  skeletonWrap: {
    gap: SPACING.sm,
  },
  // Select footer
  selectFooter: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  selectButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  selectButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
});
