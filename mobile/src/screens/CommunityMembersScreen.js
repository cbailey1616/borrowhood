import ActionSheet from '../components/ActionSheet';
import ShimmerImage from '../components/ShimmerImage';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import { ThemedAlert as Alert } from '../components/ThemedAlert';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/config';

export default function CommunityMembersScreen({ route, navigation }) {
  const communityId = route?.params?.id || route?.params?.communityId;
  const { user } = useAuth();
  const { showToast, showError } = useError();
  const [actionMember, setActionMember] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(route?.params?.role || 'member');
  const [loadError, setLoadError] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const isOrganizer = userRole === 'organizer';

  const fetchMembers = useCallback(async () => {
    if (!communityId) { setLoading(false); return; }
    try {
      const data = await api.getCommunityMembers(communityId, { limit: 100 });
      setMembers(data || []);
      const me = (data || []).find(m => m.id === user?.id);
      setUserRole(me?.role || route?.params?.role || 'member');
      setLoadError(false);
    } catch (err) {
      setLoadError(true);
      showError({ message: 'Failed to load members' });
    } finally {
      setLoading(false);
    }
  }, [communityId, route?.params?.role, user?.id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => {
    navigation.setOptions?.({ title: 'Neighbors' });
  }, [isOrganizer, navigation]);

  const handlePromote = (member) => {
    Alert.alert(
      'Make Moderator',
      `Make ${member.firstName} a moderator?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Moderator',
          onPress: async () => {
            try {
              await api.addCommunityAdmin(communityId, member.id);
              haptics.success();
              showToast(`${member.firstName} is now a moderator`, 'success');
              fetchMembers();
            } catch (err) {
              haptics.error();
              showError({ message: err.message || 'Could not make this member a moderator' });
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
            setRemovingMemberId(member.id);
            try {
              await api.removeCommunityMember(communityId, member.id);
              setMembers(current => current.filter(item => item.id !== member.id));
              haptics.success();
              showToast(`${member.firstName} removed`, 'success');
            } catch (err) {
              haptics.error();
              showError({ message: err.message || 'Failed to remove member' });
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ]
    );
  };

  const renderMember = ({ item }) => (
    <HapticPressable
      haptic="light"
      style={styles.memberRow}
      onPress={() => navigation.navigate('UserProfile', { id: item.id })}
    >
      <ShimmerImage placeholderIcon="person"
        source={{ uri: item.profilePhotoUrl || null }}
        style={styles.avatar}
      />
      <View style={styles.memberInfo}>
        <View style={{ gap: 4, alignItems: 'flex-start' }}>
          <Text style={styles.memberName}>{item.firstName} {item.lastName}</Text>
          {item.role === 'organizer' && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
              <Text style={styles.adminBadgeText}>Moderator</Text>
            </View>
          )}
        </View>
        {item.city && (
          <Text style={styles.memberLocation}>{item.city}{item.state ? `, ${item.state}` : ''}</Text>
        )}
      </View>
      {isOrganizer && item.role !== 'organizer' && item.id !== user?.id && (
        <HapticPressable accessibilityRole="button" accessibilityLabel={`Manage ${item.firstName}`}
          onPress={event => { event?.stopPropagation?.(); setActionMember(item); }} style={{ padding: 12 }} disabled={removingMemberId === item.id}>
          <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.primary} />
        </HapticPressable>
      )}
    </HapticPressable>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.spinner} />
      </View>
    );
  }

  if (!communityId) return <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>Choose a neighborhood to see its members.</Text>
    <ActionButton label="My neighborhoods" icon="people-outline" onPress={() => navigation.navigate('MyCommunity')} />
  </View>;

  if (loadError) return <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>Could not load members.</Text>
    <ActionButton label="Try again" icon="refresh-outline" onPress={fetchMembers} />
  </View>;

  return (
    <View style={styles.container}>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.cardGap} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Neighbors</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{members.length}</Text>
            </View>
            <HapticPressable accessibilityLabel="Invite neighbors" onPress={() => navigation.navigate('InviteMembers', { communityId })}
              style={{ marginLeft: 'auto', backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 12 }}><Text style={{ color: COLORS.surface }}>+ Invite</Text></HapticPressable>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No members yet</Text>
          </View>
        }
      />
      <ActionSheet isVisible={!!actionMember} onClose={() => setActionMember(null)} title={actionMember?.firstName}
        actions={actionMember ? [
          { label: 'Make moderator', onPress: () => handlePromote(actionMember) },
          { label: 'Remove from neighborhood', destructive: true, onPress: () => handleRemove(actionMember) },
        ] : []} />
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
    paddingBottom: SPACING.xxl,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.primaryMuted,
  },
  countText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
    ...SHADOWS.sm,
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
    flexDirection: 'column',
    gap: SPACING.sm,
    flexShrink: 1,
  },
  promoteButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  promoteButtonText: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '400', flexShrink: 1 },
  removeButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerMuted,
  },
  removeButtonText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    fontWeight: '400',
  },
  cardGap: {
    height: SPACING.sm,
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
