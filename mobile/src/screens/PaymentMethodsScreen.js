import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import ActionSheet from '../components/ActionSheet';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function PaymentMethodsScreen({ navigation, route }) {
  const selectMode = route.params?.selectMode || false;
  const onSelectMethod = route.params?.onSelectMethod;
  const { showError } = useError();
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removeSheetVisible, setRemoveSheetVisible] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [connectStatus, setConnectStatus] = useState(null);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  // Refresh list and connect status when returning
  useFocusEffect(
    useCallback(() => {
      fetchPaymentMethods();
      loadConnectStatus();
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
      console.error('Failed to fetch payment methods:', error);
      setPaymentMethods([]);
    } finally {
      setIsLoading(false);
    }
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
        message: 'Unable to remove card. Please try again.',
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
        message: 'Unable to set default card. Please try again.',
        type: 'network',
      });
    }
  };

  const getCardIcon = (brand) => {
    switch (brand?.toLowerCase()) {
      case 'visa': return 'V';
      case 'mastercard': return 'M';
      case 'amex': return 'A';
      default: return '\u2022';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <ScrollView style={styles.scrollContainer}>
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
                disabled={!selectMode}
              >
                <BlurCard style={styles.card}>
                  {selectMode && (
                    <Ionicons
                      name={selectedId === card.id ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selectedId === card.id ? COLORS.primary : COLORS.gray[500]}
                    />
                  )}
                  <View style={styles.cardIcon}>
                    <Text style={styles.cardIconText}>{getCardIcon(card.brand)}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardBrand}>
                      {card.brand} {'\u2022\u2022\u2022\u2022'} {card.last4}
                    </Text>
                    <Text style={styles.cardExpiry}>
                      Expires {card.expMonth}/{card.expYear}
                    </Text>
                  </View>
                  {!selectMode && card.isDefault ? (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultText}>Default</Text>
                    </View>
                  ) : !selectMode ? (
                    <HapticPressable
                      haptic="light"
                      style={styles.setDefaultButton}
                      onPress={() => handleSetDefault(card)}
                    >
                      <Text style={styles.setDefaultText}>Set Default</Text>
                    </HapticPressable>
                  ) : null}
                  {!selectMode && (
                    <HapticPressable
                      haptic="light"
                      style={styles.removeButton}
                      onPress={() => {
                        setSelectedCard(card);
                        setRemoveSheetVisible(true);
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </HapticPressable>
                  )}
                </BlurCard>
              </HapticPressable>
            ))}
          </View>
        ) : (
          <BlurCard style={styles.emptyCard}>
            <Ionicons name="card-outline" size={48} color={COLORS.gray[600]} />
            <Text style={styles.emptyText}>No payment methods added</Text>
            <Text style={styles.emptySubtext}>
              Add a card to pay for borrowing items with rental fees
            </Text>
          </BlurCard>
        )}

        <HapticPressable haptic="medium" style={styles.addButton} onPress={handleAddCard}>
          <Ionicons name="add" size={20} color={COLORS.primary} />
          <Text style={styles.addButtonText}>Add Payment Method</Text>
        </HapticPressable>
      </View>

      {!selectMode && <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout Account</Text>
        {connectStatus?.chargesEnabled && connectStatus?.payoutsEnabled ? (
          <BlurCard style={styles.payoutActiveCard}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.payoutActiveTitle}>Payouts Enabled</Text>
              <Text style={styles.payoutActiveSubtext}>
                You can receive payments when others borrow your items.
              </Text>
            </View>
          </BlurCard>
        ) : (
          <>
            <BlurCard style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.infoText}>
                Set up a payout account to receive payments when others borrow your items.
              </Text>
            </BlurCard>
            <HapticPressable
              haptic="medium"
              style={styles.addButton}
              onPress={() => navigation.navigate('SetupPayout')}
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
              <Text style={styles.addButtonText}>Set Up Payout Account</Text>
            </HapticPressable>
          </>
        )}
      </View>}

      <ActionSheet
        isVisible={removeSheetVisible}
        onClose={() => setRemoveSheetVisible(false)}
        title="Remove Card"
        message={`Remove card ending in ${selectedCard?.last4}?`}
        actions={[
          {
            label: 'Remove',
            destructive: true,
            onPress: handleRemoveCard,
          },
        ]}
      />
    </ScrollView>

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
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
  },
  cardList: {
    gap: SPACING.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  cardIcon: {
    width: 40,
    height: 28,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.gray[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconText: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  cardInfo: {
    flex: 1,
  },
  cardBrand: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  cardExpiry: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  defaultBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  defaultText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: COLORS.primary,
  },
  setDefaultButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  setDefaultText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  removeButton: {
    padding: SPACING.sm,
  },
  emptyCard: {
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  addButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
  },
  infoCard: {
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  payoutActiveCard: {
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.md,
    alignItems: 'center',
  },
  payoutActiveTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  payoutActiveSubtext: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
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
