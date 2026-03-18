import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
  InteractionManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import AnimatedCard from '../components/AnimatedCard';
import { SkeletonCard, SkeletonListItem } from '../components/SkeletonLoader';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function EarningsScreen({ navigation }) {
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { showError } = useError();

  const fetchEarnings = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const data = await api.getEarnings();
      setEarnings(data);
    } catch (error) {
      console.error('Error fetching earnings:', error);
      showError({ message: error.message || 'Couldn\'t load your earnings. Please check your connection and pull down to refresh.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showError]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        fetchEarnings();
      });
      return () => task?.cancel();
    }, [fetchEarnings])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    haptics.light();
    fetchEarnings(true);
  };

  const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getPayoutStatusColor = (status) => {
    switch (status) {
      case 'paid': return COLORS.secondary;
      case 'pending': case 'in_transit': return COLORS.warning;
      case 'failed': case 'canceled': return COLORS.danger;
      default: return COLORS.textMuted;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonContent}>
          <SkeletonCard />
          <View style={styles.statsRow}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      </View>
    );
  }

  const { balance, stats, recentTransactions, payouts, hasConnectAccount, connectStatus } = earnings || {};

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Total Earned Card */}
        <View style={[styles.balanceCard, styles.cardBox]}>
          <Text style={styles.balanceLabel}>Total Earned</Text>
          <Text style={styles.balanceAmount}>
            {formatCurrency(stats?.totalEarned)}
          </Text>
        </View>

        {/* Payout Status Card */}
        {connectStatus?.chargesEnabled && connectStatus?.payoutsEnabled ? (
          <View style={[styles.payoutStatusCard, styles.cardBox]}>
            <View style={styles.payoutIconWrap}>
              <Ionicons name="checkmark-circle" size={28} color={COLORS.primary} />
            </View>
            <View style={styles.payoutStatusInfo}>
              <Text style={styles.payoutStatusTitle}>Payouts Active</Text>
              <Text style={styles.payoutStatusSubtext}>
                You'll receive payments when others borrow your items. Funds are deposited to your bank account.
              </Text>
            </View>
          </View>
        ) : connectStatus?.detailsSubmitted ? (
          <View style={[styles.payoutStatusCard, styles.cardBox]}>
            <View style={styles.payoutIconWrap}>
              <Ionicons name="time" size={28} color="#F5A623" />
            </View>
            <View style={styles.payoutStatusInfo}>
              <Text style={styles.payoutStatusTitle}>Verification in Progress</Text>
              <Text style={styles.payoutStatusSubtext}>
                Stripe is reviewing your payout account. This usually takes just a few minutes.
              </Text>
            </View>
          </View>
        ) : (
          <HapticPressable
            haptic="medium"
            onPress={() => navigation.navigate('SetupPayout')}
          >
            <View style={[styles.payoutSetupCard, styles.cardBox]}>
              <View style={styles.payoutSetupContent}>
                <View style={styles.payoutIconWrap}>
                  <Ionicons name="wallet-outline" size={28} color={COLORS.primary} />
                </View>
                <View style={styles.payoutStatusInfo}>
                  <Text style={styles.payoutStatusTitle}>Set Up Payouts</Text>
                  <Text style={styles.payoutStatusSubtext}>
                    Connect a bank account to earn money when people borrow your items.
                  </Text>
                </View>
              </View>
              <View style={styles.payoutSetupAction}>
                <Text style={styles.payoutSetupActionText}>Get Started</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </View>
            </View>
          </HapticPressable>
        )}

        {/* Fee Breakdown */}
        {(stats?.totalRentals || 0) > 0 && (
          <View style={[styles.feeBreakdown, styles.cardBox]}>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Rental Income</Text>
              <Text style={styles.feeValue}>{formatCurrency(stats?.totalRentalIncome)}</Text>
            </View>
            <View style={styles.feeSeparator} />
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Platform Fee (3%)</Text>
              <Text style={styles.feeDeduction}>-{formatCurrency(stats?.totalPlatformFees)}</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Payment Processing</Text>
              <Text style={styles.feeDeduction}>-{formatCurrency(stats?.totalStripeFees)}</Text>
            </View>
            <View style={styles.feeSeparator} />
            <View style={styles.feeRow}>
              <Text style={styles.feeLabelBold}>Your Earnings</Text>
              <Text style={styles.feeValueBold}>{formatCurrency(stats?.totalEarned)}</Text>
            </View>
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.cardBox]}>
            <Ionicons name="swap-horizontal" size={22} color={COLORS.primary} />
            <Text style={styles.statValue}>{stats?.totalRentals || 0}</Text>
            <Text style={styles.statLabel}>Rentals</Text>
          </View>
          <View style={[styles.statCard, styles.cardBox]}>
            <Ionicons name="trending-up" size={22} color={COLORS.warning} />
            <Text style={styles.statValue}>{formatCurrency(stats?.averagePerRental)}</Text>
            <Text style={styles.statLabel}>Avg/Rental</Text>
          </View>
        </View>

        {(stats?.activeRentals || 0) > 0 && (
          <View style={styles.activeRow}>
            <Ionicons name="time" size={16} color={COLORS.primary} />
            <Text style={styles.activeText}>
              {stats.activeRentals} active rental{stats.activeRentals !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Recent Earnings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Recent Earnings</Text>
          {recentTransactions?.length > 0 ? (
            recentTransactions.map((txn, index) => (
              <AnimatedCard key={txn.id} index={index}>
                <HapticPressable
                  style={styles.earningCard}
                  onPress={() => navigation.navigate('TransactionDetail', { id: txn.id })}
                  haptic="light"
                >
                  {txn.listing.photo ? (
                    <Image source={{ uri: txn.listing.photo }} style={styles.thumbnail} />
                  ) : (
                    <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                      <Ionicons name="image-outline" size={20} color={COLORS.gray[500]} />
                    </View>
                  )}
                  <View style={styles.earningInfo}>
                    <Text style={styles.earningTitle} numberOfLines={1}>
                      {txn.listing.title}
                    </Text>
                    <Text style={styles.earningBorrower} numberOfLines={1}>
                      {txn.borrower.firstName} {txn.borrower.lastName}
                    </Text>
                    <Text style={styles.earningDate}>
                      {formatDate(txn.actualReturnAt || txn.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.earningAmount}>
                    +{formatCurrency(txn.lenderPayout)}
                  </Text>
                </HapticPressable>
              </AnimatedCard>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="cash-outline" size={48} color={COLORS.gray[600]} />
              <Text style={styles.emptyTitle}>No earnings yet</Text>
              <Text style={styles.emptySubtitle}>
                Earnings appear here when borrowers return your items
              </Text>
            </View>
          )}
        </View>

        {/* Payout History */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Payout History</Text>
          {payouts?.length > 0 ? (
            payouts.map((payout, index) => {
              const statusColor = getPayoutStatusColor(payout.status);
              return (
                <AnimatedCard key={payout.id} index={index}>
                  <View style={styles.payoutCard}>
                    <View>
                      <Text style={styles.payoutAmount}>
                        {formatCurrency(payout.amount)}
                      </Text>
                      <Text style={styles.payoutDate}>
                        {payout.status === 'paid' ? 'Arrived' : 'Arrives'}{' '}
                        {formatDate(payout.arrivalDate * 1000)}
                      </Text>
                    </View>
                    <View style={[styles.payoutBadge, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[styles.payoutBadgeText, { color: statusColor }]}>
                        {payout.status === 'in_transit' ? 'In Transit' : payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                </AnimatedCard>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="card-outline" size={48} color={COLORS.gray[600]} />
              <Text style={styles.emptyTitle}>No payouts yet</Text>
              <Text style={styles.emptySubtitle}>
                Payouts appear here after your first completed rental
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  skeletonContent: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  balanceCard: {
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  balanceLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  balanceAmount: {
    fontSize: 36,
    fontFamily: 'DMSans_700Bold',
    fontWeight: '700',
    color: COLORS.secondary,
    letterSpacing: -1,
  },
  payoutStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  payoutSetupCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  payoutSetupContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  payoutIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutStatusInfo: {
    flex: 1,
  },
  payoutStatusTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  payoutStatusSubtext: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  payoutSetupAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  payoutSetupActionText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.primary,
  },
  feeBreakdown: {
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  feeLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  feeLabelBold: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
  },
  feeValue: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.text,
  },
  feeValueBold: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  feeDeduction: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.danger,
  },
  feeSeparator: {
    height: 1,
    backgroundColor: COLORS.separator,
    marginVertical: SPACING.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    padding: SPACING.md,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statValue: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  statLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  activeText: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.primary,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  earningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray[700],
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningInfo: {
    flex: 1,
  },
  earningTitle: {
    ...TYPOGRAPHY.subheadline,
    fontWeight: '600',
    color: COLORS.text,
  },
  earningBorrower: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  earningDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  earningAmount: {
    ...TYPOGRAPHY.headline,
    color: COLORS.secondary,
  },
  payoutCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  payoutAmount: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  payoutDate: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  payoutBadge: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  payoutBadgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xl,
  },
});
