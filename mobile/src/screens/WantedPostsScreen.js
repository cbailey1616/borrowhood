import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  TextInput,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';

export default function WantedPostsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      const params = searchQuery ? { search: searchQuery } : {};
      const data = await api.getRequests(params);
      setRequests(data);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchRequests();
    });
    return unsubscribe;
  }, [navigation, fetchRequests]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchRequests();
  };

  const formatDateRange = (from, until) => {
    if (!from && !until) return null;
    const fromDate = from ? new Date(from).toLocaleDateString() : '';
    const untilDate = until ? new Date(until).toLocaleDateString() : '';
    if (from && until) return `${fromDate} - ${untilDate}`;
    if (from) return `From ${fromDate}`;
    return `Until ${untilDate}`;
  };

  const renderItem = ({ item }) => (
    <HapticPressable
      onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
      haptic="light"
    >
      <BlurCard style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Image
              source={{ uri: item.requester.profilePhotoUrl || 'https://via.placeholder.com/40' }}
              style={styles.avatar}
            />
            <View style={styles.requesterInfo}>
              <Text style={styles.requesterName}>
                {item.requester.firstName} {item.requester.lastName[0]}.
              </Text>
              <Text style={styles.timeAgo}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.description && (
            <Text style={styles.cardDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {(item.neededFrom || item.neededUntil) && (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.dateText}>
                {formatDateRange(item.neededFrom, item.neededUntil)}
              </Text>
            </View>
          )}

          {item.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          )}

          <HapticPressable
            style={styles.haveThisButton}
            onPress={() => navigation.navigate('CreateListing', { requestMatch: item })}
            haptic="medium"
          >
            <Ionicons name="hand-right-outline" size={18} color={COLORS.primary} />
            <Text style={styles.haveThisText}>I Have This</Text>
          </HapticPressable>
        </View>
      </BlurCard>
    </HapticPressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search wanted items..."
          placeholderTextColor={COLORS.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={fetchRequests}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <HapticPressable onPress={() => setSearchQuery('')} haptic="light">
            <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
          </HapticPressable>
        )}
      </View>

      <FlatList
        data={requests}
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
          !isLoading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={64} color={COLORS.gray[700]} />
              <Text style={styles.emptyTitle}>No wanted posts</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'Try adjusting your search'
                  : 'People in your community will post items they need here'}
              </Text>
            </View>
          )
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.md,
  },
  searchInput: {
    flex: 1,
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  card: {
    marginBottom: SPACING.md,
  },
  cardContent: {
    padding: SPACING.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  requesterInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  requesterName: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
  },
  timeAgo: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  cardDescription: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.md,
  },
  dateText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.separator,
    paddingHorizontal: SPACING.md - 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xs,
    marginBottom: SPACING.md,
  },
  categoryText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  haveThisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md - 2,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: SPACING.sm,
  },
  haveThisText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.primary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
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
    paddingHorizontal: SPACING.xxl,
  },
});
