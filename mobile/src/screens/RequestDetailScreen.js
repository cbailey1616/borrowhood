import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, VISIBILITY_LABELS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';
import { useFocusEffect } from '@react-navigation/native';

export default function RequestDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchRequest();
    }, [id])
  );

  const fetchRequest = async () => {
    try {
      const data = await api.getRequest(id);
      setRequest(data);
    } catch (error) {
      console.error('Failed to fetch request:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteSheet(true);
  };

  const performDelete = async () => {
    setIsDeleting(true);
    try {
      await api.deleteRequest(id);
      haptics.success();
      navigation.goBack();
    } catch (error) {
      haptics.error();
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDateRange = (from, until) => {
    if (!from && !until) return null;
    const fromDate = from ? new Date(from).toLocaleDateString() : '';
    const untilDate = until ? new Date(until).toLocaleDateString() : '';
    if (from && until) return `${fromDate} - ${untilDate}`;
    if (from) return `From ${fromDate}`;
    return `Until ${untilDate}`;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Request not found</Text>
      </View>
    );
  }

  const dateRange = formatDateRange(request.neededFrom, request.neededUntil);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Badge */}
        <View style={styles.statusRow}>
          <View style={[
            styles.statusBadge,
            { backgroundColor: request.status === 'open' ? COLORS.secondary + '20' : COLORS.separator }
          ]}>
            <Text style={[
              styles.statusText,
              { color: request.status === 'open' ? COLORS.secondary : COLORS.textSecondary }
            ]}>
              {request.status === 'open' ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{request.title}</Text>

        {/* Badges */}
        <View style={styles.badges}>
          {request.type === 'service' && (
            <View style={[styles.badge, styles.typeBadge]}>
              <Ionicons name="construct-outline" size={12} color={COLORS.primary} />
              <Text style={[styles.badgeText, { color: COLORS.primary }]}>Service</Text>
            </View>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{VISIBILITY_LABELS[request.visibility]}</Text>
          </View>
          {request.category && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{request.category}</Text>
            </View>
          )}
        </View>

        {/* Date Range */}
        {dateRange && (
          <BlurCard style={styles.dateCard}>
            <View style={styles.dateCardContent}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.textSecondary} />
              <View style={styles.dateInfo}>
                <Text style={styles.dateLabel}>Needed</Text>
                <Text style={styles.dateValue}>{dateRange}</Text>
              </View>
            </View>
          </BlurCard>
        )}

        {/* Description */}
        {request.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <Text style={styles.description}>{request.description}</Text>
          </View>
        )}

        {/* Requester */}
        <HapticPressable
          style={styles.requesterCard}
          onPress={() => navigation.navigate('UserProfile', { id: request.requester.id })}
          haptic="light"
        >
          <Image
            source={{ uri: request.requester.profilePhotoUrl || 'https://via.placeholder.com/48' }}
            style={styles.requesterAvatar}
          />
          <View style={styles.requesterInfo}>
            <Text style={styles.requesterLabel}>Requested by</Text>
            <Text style={styles.requesterName}>
              {request.requester.firstName} {request.requester.lastName}
            </Text>
            {request.requester.totalTransactions > 0 && (
              <Text style={styles.requesterTransactions}>
                {request.requester.totalTransactions} transactions
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </HapticPressable>

        {/* Posted date */}
        <Text style={styles.postedDate}>
          Posted {new Date(request.createdAt).toLocaleDateString()}
        </Text>
      </ScrollView>

      {/* Action Buttons */}
      {!request.isOwner && request.status === 'open' && (
        <View style={styles.footer}>
          <HapticPressable
            style={styles.haveThisButton}
            onPress={() => navigation.navigate('CreateListing', { requestMatch: request })}
            haptic="medium"
          >
            <Ionicons name="hand-right-outline" size={20} color="#fff" />
            <Text style={styles.haveThisButtonText}>I Have This</Text>
          </HapticPressable>
        </View>
      )}

      {request.isOwner && request.status === 'open' && (
        <View style={styles.footer}>
          <HapticPressable
            style={styles.editButton}
            onPress={() => navigation.navigate('EditRequest', { request })}
            haptic="medium"
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.editButtonText}>Edit Request</Text>
          </HapticPressable>
          <HapticPressable
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={isDeleting}
            haptic="medium"
          >
            {isDeleting ? (
              <ActivityIndicator color={COLORS.danger} size="small" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={20} color={COLORS.danger} />
                <Text style={styles.deleteButtonText}>Close Request</Text>
              </>
            )}
          </HapticPressable>
        </View>
      )}

      <ActionSheet
        isVisible={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        title="Close Request"
        message="Are you sure you want to close this request? It will no longer be visible to others."
        actions={[
          {
            label: 'Close',
            destructive: true,
            onPress: performDelete,
          },
        ]}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  content: {
    padding: SPACING.xl - 4,
  },
  statusRow: {
    marginBottom: SPACING.md,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.sm,
  },
  statusText: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
  },
  title: {
    ...TYPOGRAPHY.h2,
    fontSize: 24,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xl - 4,
  },
  badge: {
    backgroundColor: COLORS.separator,
    paddingHorizontal: SPACING.md - 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary + '15',
  },
  badgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  dateCard: {
    marginBottom: SPACING.xl - 4,
  },
  dateCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  dateInfo: {
    flex: 1,
  },
  dateLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  dateValue: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    marginTop: 2,
  },
  section: {
    marginBottom: SPACING.xl - 4,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  description: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  requesterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  requesterAvatar: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  requesterInfo: {
    flex: 1,
  },
  requesterLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  requesterName: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  requesterTransactions: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  postedDate: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
    backgroundColor: COLORS.surface,
  },
  haveThisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  haveThisButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  editButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
    gap: SPACING.sm,
  },
  deleteButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: COLORS.danger,
  },
});
