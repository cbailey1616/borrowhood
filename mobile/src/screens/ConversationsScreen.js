import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function ConversationsScreen({ navigation, onRead }) {
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Refresh badge count when returning to this screen
  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      if (onRead) onRead();
    });
    return unsubscribeFocus;
  }, [navigation, onRead]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchConversations();
    });
    return unsubscribe;
  }, [navigation, fetchConversations]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchConversations();
  };

  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(date).toLocaleDateString();
  };

  const renderItem = ({ item }) => (
    <HapticPressable
      haptic="light"
      style={styles.card}
      onPress={() => navigation.navigate('Chat', { conversationId: item.id })}
    >
      <View style={styles.avatarContainer}>
        <Image
          source={{ uri: item.otherUser?.profilePhotoUrl || 'https://via.placeholder.com/50' }}
          style={styles.avatar}
        />
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadCount}>
              {item.unreadCount > 9 ? '9+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.name, item.unreadCount > 0 && styles.nameUnread]}>
            {item.otherUser?.firstName || 'Unknown'} {item.otherUser?.lastName || ''}
          </Text>
          <Text style={styles.time}>{getTimeAgo(item.lastMessageAt)}</Text>
        </View>

        {item.listing && (
          <View style={styles.listingRow}>
            <Ionicons name="cube-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.listingTitle} numberOfLines={1}>
              {item.listing.title}
            </Text>
          </View>
        )}

        <Text
          style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]}
          numberOfLines={1}
        >
          {item.lastMessage || 'No messages yet'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
    </HapticPressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
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
              <Ionicons name="chatbubbles-outline" size={64} color={COLORS.gray[700]} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>
                Start a conversation by messaging someone about an item
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
  listContent: {
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
    gap: SPACING.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm + 2,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs + 2,
  },
  unreadCount: {
    ...TYPOGRAPHY.caption,
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  name: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.text,
  },
  nameUnread: {
    fontWeight: '700',
  },
  time: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  listingTitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    flex: 1,
  },
  lastMessage: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  lastMessageUnread: {
    color: COLORS.text,
    fontWeight: '500',
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
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
  },
});
