import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, VISIBILITY_LABELS } from '../utils/config';

export default function RequestDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchRequest();
  }, [id]);

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
    Alert.alert(
      'Close Request',
      'Are you sure you want to close this request? It will no longer be visible to others.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await api.deleteRequest(id);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
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
            { backgroundColor: request.status === 'open' ? COLORS.secondary + '20' : COLORS.gray[800] }
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
          <View style={styles.dateCard}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.textSecondary} />
            <View style={styles.dateInfo}>
              <Text style={styles.dateLabel}>Needed</Text>
              <Text style={styles.dateValue}>{dateRange}</Text>
            </View>
          </View>
        )}

        {/* Description */}
        {request.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <Text style={styles.description}>{request.description}</Text>
          </View>
        )}

        {/* Requester */}
        <TouchableOpacity
          style={styles.requesterCard}
          onPress={() => navigation.navigate('UserProfile', { id: request.requester.id })}
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
        </TouchableOpacity>

        {/* Posted date */}
        <Text style={styles.postedDate}>
          Posted {new Date(request.createdAt).toLocaleDateString()}
        </Text>
      </ScrollView>

      {/* Action Buttons */}
      {!request.isOwner && request.status === 'open' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.haveThisButton}
            onPress={() => navigation.navigate('CreateListing', { requestMatch: request })}
          >
            <Ionicons name="hand-right-outline" size={20} color="#fff" />
            <Text style={styles.haveThisButtonText}>I Have This</Text>
          </TouchableOpacity>
        </View>
      )}

      {request.isOwner && request.status === 'open' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator color={COLORS.danger} size="small" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={20} color={COLORS.danger} />
                <Text style={styles.deleteButtonText}>Close Request</Text>
              </>
            )}
          </TouchableOpacity>
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
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  content: {
    padding: 20,
  },
  statusRow: {
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  badge: {
    backgroundColor: COLORS.gray[800],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  dateInfo: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  requesterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  requesterAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray[700],
  },
  requesterInfo: {
    flex: 1,
  },
  requesterLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  requesterName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  requesterTransactions: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  postedDate: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
    backgroundColor: COLORS.surface,
  },
  haveThisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  haveThisButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
    gap: 8,
  },
  deleteButtonText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '600',
  },
});
