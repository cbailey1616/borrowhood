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
import BlurCard from '../components/BlurCard';
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

  const { balance, stats, recentTransactions, payouts, hasConnectAccount } = earnings || {};

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
        {/* Balance Card */}
        <BlurCard style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <View style={styles.balanceColumn}>
              <Text style={styles.balanceLabel}>Available</Text>
              <Text style={styles.balanceAmount}>
                {formatCurrency(balance?.available)}
              </Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={[styles.balanceColumn, { alignItems: 'flex-end' }]}>
              <Text style={styles.balanceLabel}>Pending</Text>
              <Text style={styles.balancePending}>
                {formatCurrency(balance?.pending)}
              </Text>
            </View>
          </View>
          {!hasConnectAccount && (
            <HapticPressable
              style={styles.setupButton}
              onPress={() => navigation.navigate('SetupPayout')}
              haptic="medium"
            >
              <Ionicons name="wallet-outline" size={18} color="#fff" />
              <Text style={styles.setupButtonText}>Set Up Payouts</Text>
            </HapticPressable>
          )}
        </BlurCard>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <BlurCard style={styles.statCard}>
            <Ionicons name="cash" size={22} color={COLORS.secondary} />
            <Text style={styles.statValue}>{formatCurrency(stats?.totalEarned)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </BlurCard>
          <BlurCard style={styles.statCard}>
            <Ionicons name="swap-horizontal" size={22} color={COLORS.primary} />
            <Text style={styles.statValue}>{stats?.totalRentals || 0}</Text>
            <Text style={styles.statLabel}>Rentals</Text>
          </BlurCard>
          <BlurCard style={styles.statCard}>
            <Ionicons name="trending-up" size={22} color={COLORS.warning} />
            <Text style={styles.statValue}>{formatCurrency(stats?.averagePerRental)}</Text>
            <Text style={styles.statLabel}>Avg/Rental</Text>
          </BlurCard>
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
  balanceCard: {
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceColumn: {
    flex: 1,
  },
  balanceDivider: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    backgroundColor: COLORS.separator,
    marginHorizontal: SPACING.lg,
  },
  balanceLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  balanceAmount: {
    ...TYPOGRAPHY.h1,
    color: COLORS.secondary,
  },
  balancePending: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
  },
  setupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  setupButtonText: {
    ...TYPOGRAPHY.headline,
    color: '#fff',
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
