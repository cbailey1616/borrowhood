import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';

const STATUS_LABELS = {
  open: 'Open',
  under_review: 'Under Review',
  resolved: 'Resolved',
};

const STATUS_COLORS = {
  open: COLORS.warning,
  under_review: COLORS.primary,
  resolved: COLORS.secondary,
};

export default function DisputesScreen({ navigation }) {
  const [disputes, setDisputes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDisputes = useCallback(async () => {
    try {
      const data = await api.getDisputes();
      setDisputes(data.disputes || data);
    } catch (error) {
      console.error('Failed to fetch disputes:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchDisputes();
  };

  const renderItem = ({ item }) => (
    <HapticPressable
      onPress={() => navigation.navigate('DisputeDetail', { id: item.id })}
      haptic="light"
    >
      <BlurCard style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
                {STATUS_LABELS[item.status]}
              </Text>
            </View>
            <Text style={styles.date}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>

          <Text style={styles.title}>{item.listing?.title || 'Item'}</Text>
          <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text>

          <View style={styles.cardFooter}>
            <Text style={styles.transactionLabel}>
              Transaction #{item.transactionId?.slice(-6)}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
          </View>
        </View>
      </BlurCard>
    </HapticPressable>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
            <Ionicons name="shield-checkmark-outline" size={64} color={COLORS.gray[700]} />
            <Text style={styles.emptyTitle}>No disputes</Text>
            <Text style={styles.emptySubtitle}>
              You don't have any active or past disputes
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
  listContent: {
    padding: SPACING.lg,
    flexGrow: 1,
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
  title: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  reason: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
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
  transactionLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
});
