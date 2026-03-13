import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function CommunityMembersScreen({ route, navigation }) {
  const { id: communityId } = route.params;
  const { user } = useAuth();
  const { showToast, showError } = useError();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('member');

  const fetchMembers = useCallback(async () => {
    try {
      const data = await api.getCommunityMembers(communityId, { limit: 100 });
      setMembers(data || []);
      const me = (data || []).find(m => m.id === user?.id);
      if (me) setUserRole(me.role);
    } catch (err) {
      showError({ message: 'Failed to load members' });
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handlePromote = (member) => {
    Alert.alert(
      'Make Admin',
      `Make ${member.firstName} an admin of this neighborhood? They'll be able to manage members and settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Admin',
          onPress: async () => {
            try {
              await api.addCommunityAdmin(communityId, member.id);
              haptics.success();
              showToast(`${member.firstName} is now an admin!`, 'success');
              fetchMembers();
            } catch (err) {
              haptics.error();
              showError({ message: err.message || 'Failed to promote member' });
            }
          },
        },
      ]
    );
  };

  const handleRemove = (member) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.firstName} from this neighborhood?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeCommunityMember(communityId, member.id);
              haptics.success();
              showToast(`${member.firstName} has been removed`, 'success');
              fetchMembers();
            } catch (err) {
              haptics.error();
              showError({ message: err.message || 'Failed to remove member' });
            }
          },
        },
      ]
    );
  };

  const isOrganizer = userRole === 'organizer';

  const renderMember = ({ item }) => (
    <HapticPressable
      haptic="light"
      style={styles.memberRow}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
    >
      <Image
        source={{ uri: item.profilePhotoUrl || 'https://via.placeholder.com/44' }}
        style={styles.avatar}
      />
      <View style={styles.memberInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.memberName}>{item.firstName} {item.lastName}</Text>
          {item.role === 'organizer' && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>
        {item.city && (
          <Text style={styles.memberLocation}>{item.city}{item.state ? `, ${item.state}` : ''}</Text>
        )}
      </View>
      {isOrganizer && item.role !== 'organizer' && item.id !== user?.id && (
        <View style={styles.adminActions}>
          <HapticPressable
            haptic="medium"
            style={styles.promoteButton}
            onPress={() => handlePromote(item)}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
          </HapticPressable>
          <HapticPressable
            haptic="medium"
            style={styles.removeButton}
            onPress={() => handleRemove(item)}
          >
            <Ionicons name="person-remove-outline" size={18} color={COLORS.danger} />
          </HapticPressable>
        </View>
      )}
    </HapticPressable>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No members yet</Text>
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
  list: {
    padding: SPACING.lg,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray[200],
  },
  memberInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  memberName: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  adminBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
  },
  memberLocation: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  adminActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  promoteButton: {
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryMuted,
  },
  removeButton: {
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerMuted,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.separator,
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
});
