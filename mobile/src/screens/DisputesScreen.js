import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import SegmentedControl from '../components/SegmentedControl';

const STATUS_SEGMENTS = [
  { label: 'All', value: null },
  { label: 'Awaiting', value: 'awaitingResponse' },
  { label: 'Review', value: 'underReview' },
  { label: 'Resolved', value: 'resolved' },
];

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: COLORS.warning },
  awaitingResponse: { label: 'Awaiting Response', color: COLORS.warning },
  underReview: { label: 'Under Review', color: COLORS.primary },
  resolvedInFavorOfClaimant: { label: 'Resolved', color: COLORS.secondary },
  resolvedInFavorOfRespondent: { label: 'Resolved', color: COLORS.secondary },
  dismissed: { label: 'Dismissed', color: COLORS.textMuted },
  expired: { label: 'Expired', color: COLORS.danger },
};

const TYPE_CONFIG = {
  damagesClaim: { label: 'Damages', icon: 'construct-outline' },
  nonReturn: { label: 'Non-Return', icon: 'close-circle-outline' },
  lateReturn: { label: 'Late Return', icon: 'time-outline' },
  itemNotAsDescribed: { label: 'Not As Described', icon: 'alert-circle-outline' },
  paymentIssue: { label: 'Payment', icon: 'card-outline' },
  noShow: { label: 'No Show', icon: 'person-remove-outline' },
};

const TYPE_KEYS = Object.keys(TYPE_CONFIG);

export default function DisputesScreen({ navigation }) {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);

  const isOrganizerOrAdmin = user?.isAdmin || false; // Organizers handled by backend scoping

  const fetchDisputes = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter === 'resolved') {
        // Backend expects exact status values; filter resolved ones client-side
      } else if (statusFilter) {
        params.status = statusFilter;
      }
      if (typeFilter) {
        params.type = typeFilter;
      }
      const data = await api.getDisputes(params);
      let items = data.disputes || data;

      // Client-side filter for "resolved" segment (covers multiple statuses)
      if (statusFilter === 'resolved') {
        items = items.filter(d =>
          ['resolvedInFavorOfClaimant', 'resolvedInFavorOfRespondent', 'dismissed', 'expired'].includes(d.status)
        );
      }

      setDisputes(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error('Failed to fetch disputes:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchDisputes();
  }, [fetchDisputes]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchDisputes();
  };

  const handleSegmentChange = (index) => {
    setStatusFilter(STATUS_SEGMENTS[index].value);
  };

  const renderTypeChip = (typeKey) => {
    const config = TYPE_CONFIG[typeKey];
    const isActive = typeFilter === typeKey;
    return (
      <HapticPressable
        key={typeKey}
        style={[styles.typeChip, isActive && styles.typeChipActive]}
        onPress={() => setTypeFilter(isActive ? null : typeKey)}
        haptic="light"
      >
        <Ionicons
          name={config.icon}
          size={14}
          color={isActive ? '#fff' : COLORS.textSecondary}
        />
        <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>
          {config.label}
        </Text>
      </HapticPressable>
    );
  };

  const renderItem = ({ item }) => {
    const statusConf = STATUS_CONFIG[item.status] || { label: item.status, color: COLORS.textMuted };
    const typeConf = TYPE_CONFIG[item.type] || { label: item.type, icon: 'help-circle-outline' };

    return (
      <HapticPressable
        onPress={() => navigation.navigate('DisputeDetail', { id: item.id })}
        haptic="light"
      >
        <View style={[styles.card, styles.cardBox]}>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={[styles.statusBadge, { backgroundColor: statusConf.color + '20' }]}>
                <Text style={[styles.statusText, { color: statusConf.color }]}>
                  {statusConf.label}
                </Text>
              </View>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.titleRow}>
              <Ionicons name={typeConf.icon} size={16} color={COLORS.textSecondary} />
              <Text style={styles.title}>{item.listing?.title || 'Item'}</Text>
            </View>

            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>

            <View style={styles.cardFooter}>
              <View style={styles.partiesRow}>
                {item.claimant && (
                  <Text style={styles.partyText}>
                    {item.claimant.firstName} vs {item.respondent?.firstName || '...'}
                  </Text>
                )}
              </View>
              {item.requestedAmount != null && (
                <Text style={styles.amountText}>${item.requestedAmount.toFixed(2)}</Text>
              )}
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </View>
          </View>
        </View>
      </HapticPressable>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const selectedSegmentIndex = STATUS_SEGMENTS.findIndex(s => s.value === statusFilter);

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filtersContainer}>
        <SegmentedControl
          segments={STATUS_SEGMENTS.map(s => s.label)}
          selectedIndex={selectedSegmentIndex >= 0 ? selectedSegmentIndex : 0}
          onIndexChange={handleSegmentChange}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.typeChipsRow}
          style={styles.typeChipsScroll}
        >
          {TYPE_KEYS.map(renderTypeChip)}
        </ScrollView>
      </View>

      <FlatList
        data={disputes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="shield-checkmark-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No disputes</Text>
            <Text style={styles.emptySubtitle}>
              {statusFilter || typeFilter
                ? 'No disputes match your current filters'
                : "You don't have any active or past disputes"}
            </Text>
          </View>
        }
      />
    </View>
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
  filtersContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  typeChipsScroll: {
    marginTop: SPACING.md,
  },
  typeChipsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  typeChipActive: {
    backgroundColor: COLORS.primary,
  },
  typeChipText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  typeChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: SPACING.lg,
    flexGrow: 1,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  card: {
    marginBottom: SPACING.md,
  },
  cardContent: {
    padding: SPACING.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md - 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
  },
  statusText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
  },
  date: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    flex: 1,
  },
  description: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  partiesRow: {
    flex: 1,
  },
  partyText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  amountText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
});
