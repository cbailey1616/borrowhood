import ActionSheet from '../components/ActionSheet';
import ShimmerImage from '../components/ShimmerImage';
import { useState, useEffect, useCallback, useRef } from 'react';
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
import useNavigationTask from '../hooks/useNavigationTask';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { CARD_SURFACE, COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/config';

export default function CommunityMembersScreen({ route, navigation }) {
  const communityId = route?.params?.id || route?.params?.communityId;
  const { user } = useAuth();
  const handoff = route?.params?.handoff === true;
  const startNavigationTask = useNavigationTask(navigation, `${user?.id}:${communityId}:${handoff}`);
  const handoffLock = useRef(false);
  const [handoffId, setHandoffId] = useState(null);
  const [moreCandidates, setMoreCandidates] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useRef(1);
  const paging = useRef(false);
  const { showToast, showError } = useError();
  const [actionMember, setActionMember] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(route?.params?.role || 'member');
  const [loadError, setLoadError] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [rejoinRequests, setRejoinRequests] = useState([]);
  const [requestLoadError, setRequestLoadError] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const reviewLock = useRef(false);
  const isOrganizer = userRole === 'organizer';

  const fetchRequests = useCallback(async () => {
    try {
      const requests = await api.getCommunityRejoinRequests(communityId);
      setRejoinRequests(requests || []);
      setRequestLoadError(false);
    } catch {
      setRequestLoadError(true);
    }
  }, [communityId]);

  const fetchMembers = useCallback(async () => {
    if (!communityId) { setLoading(false); return; }
    try {
      const data = await api.getCommunityMembers(communityId, { limit: 100, ...(handoff ? { forSteward: true, page: 1 } : {}) });
      page.current = 1; setMoreCandidates(handoff && data?.length === 100);
      setMembers(data || []);
      const me = (data || []).find(m => m.id === user?.id);
      const role = me?.role || route?.params?.role || 'member';
      setUserRole(role);
      if (role === 'organizer' && !handoff) await fetchRequests();
      else { setRejoinRequests([]); setRequestLoadError(false); }
      setLoadError(false);
    } catch (err) {
      setLoadError(true);
      showError({ message: 'Failed to load members' });
    } finally {
      setLoading(false);
    }
  }, [communityId, route?.params?.role, user?.id, fetchRequests, handoff]);

  useEffect(() => {
    fetchMembers();
    const unsubscribe = navigation.addListener?.('focus', fetchMembers);
    return () => unsubscribe?.();
  }, [fetchMembers, navigation]);
  useEffect(() => {
    navigation.setOptions?.({ title: handoff ? 'Choose a steward' : 'Neighbors' });
  }, [isOrganizer, navigation, handoff]);

  const loadMoreCandidates = async () => {
    if (paging.current || !moreCandidates || handoffLock.current) return;
    const isCurrent = startNavigationTask();
    paging.current = true; setLoadingMore(true);
    try {
      const nextPage = page.current + 1;
      const data = await api.getCommunityMembers(communityId, { limit: 100, forSteward: true, page: nextPage });
      if (!isCurrent()) return;
      setMembers(current => [...current, ...data.filter(item => !current.some(existing => existing.id === item.id))]);
      page.current = nextPage; setMoreCandidates(data.length === 100);
    } catch (error) {
      if (isCurrent()) showError({ message: error.message || 'Could not load more neighbors. Please try again.' });
    } finally {
      paging.current = false; setLoadingMore(false);
    }
  };

  const chooseSuccessor = member => {
    if (handoffLock.current) return;
    Alert.alert('Make steward & leave?', `${member.firstName} will look after the neighborhood. You’ll leave it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Make steward & leave', onPress: async () => {
        if (handoffLock.current) return;
        const isCurrent = startNavigationTask();
        if (!isCurrent()) return;
        handoffLock.current = true; setHandoffId(member.id);
        try {
          await api.leaveCommunity(communityId, { successorId: member.id });
          if (isCurrent()) {
            haptics.success(); showToast('Stewardship passed on. You’ve left the neighborhood.', 'success');
            navigation.navigate('Main');
          }
        } catch (error) {
          if (isCurrent()) {
            showError({ message: error.message || 'Could not pass on stewardship. Please try again.' });
            if (error.code === 'INVALID_STEWARD') await fetchMembers();
          }
        } finally {
          handoffLock.current = false; setHandoffId(null);
        }
      } },
    ]);
  };

  const handlePromote = (member) => {
    Alert.alert(
      'Make Steward',
      `Make ${member.firstName} a steward?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Steward',
          onPress: async () => {
            try {
              await api.addCommunityAdmin(communityId, member.id);
              haptics.success();
              showToast(`${member.firstName} is now a steward`, 'success');
              fetchMembers();
            } catch (err) {
              haptics.error();
              showError({ message: err.message || 'Could not make this member a steward' });
            }
          },
        },
      ]
    );
  };

  const handleRemove = (member) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.firstName} from this neighborhood? They’ll need a steward’s approval to rejoin.`,
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

  const reviewRequest = async (request, decision) => {
    if (reviewLock.current) return;
    reviewLock.current = true;
    setReviewingId(request.id);
    try {
      await api.reviewCommunityRejoinRequest(communityId, request.id, decision);
      setRejoinRequests(current => current.filter(item => item.id !== request.id));
      haptics.success();
      showToast(decision === 'approve' ? `${request.firstName} can rejoin` : 'Request declined', 'success');
      if (decision === 'approve') await fetchMembers();
    } catch (err) {
      showError({ message: err.message || 'Could not review this request. Please try again.' });
    } finally {
      reviewLock.current = false;
      setReviewingId(null);
    }
  };

  const renderMember = ({ item }) => (
    <HapticPressable pressedBackgroundColor={COLORS.cardHover}
      haptic={null}
      style={styles.memberRow}
      disabled={handoff && !!handoffId}
      accessibilityLabel={handoff ? `Choose ${item.firstName} as steward` : undefined}
      onPress={() => handoff ? chooseSuccessor(item) : navigation.navigate('UserProfile', { id: item.id })}
    >
      <ShimmerImage placeholderIcon="person"
        source={{ uri: item.profilePhotoUrl || null }}
        style={styles.avatar}
      />
      <View style={styles.memberInfo}>
        <View style={{ gap: 4, alignItems: 'flex-start' }}>
          <Text maxFontSizeMultiplier={1.4} style={styles.memberName}>{item.firstName} {item.lastName}</Text>
          {item.role === 'organizer' && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
              <Text maxFontSizeMultiplier={1.4} style={styles.adminBadgeText}>Steward</Text>
            </View>
          )}
        </View>
        {item.city && (
          <Text style={styles.memberLocation}>{item.city}{item.state ? `, ${item.state}` : ''}</Text>
        )}
      </View>
      {handoff && (handoffId === item.id ? <ActivityIndicator color={COLORS.spinner} /> : <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />)}
      {!handoff && isOrganizer && item.role !== 'organizer' && item.id !== user?.id && (
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
        ListHeaderComponent={<>
          {handoff && <Text style={[styles.requestDetail, { marginBottom: SPACING.lg }]}>Choose a neighbor to manage members and neighborhood settings.</Text>}
          {!handoff && isOrganizer && (requestLoadError || rejoinRequests.length > 0) && <View style={styles.requestsSection}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Rejoin requests</Text>
            <Text style={styles.requestDetail}>These neighbors were removed. Approve a request to welcome them back.</Text>
            {requestLoadError && <View>
              <Text accessibilityRole="alert" style={styles.requestDetail}>Could not load rejoin requests.</Text>
              <ActionButton label="Retry requests" icon="refresh-outline" onPress={fetchRequests} />
            </View>}
            {rejoinRequests.map(request => <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestPerson}>
                <ShimmerImage placeholderIcon="person" source={{ uri: request.profilePhotoUrl || null }} style={styles.avatar} />
                <Text maxFontSizeMultiplier={1.4} style={[styles.memberName, { flex: 1 }]}>{request.firstName} {request.lastName}</Text>
                {reviewingId === request.id && <ActivityIndicator color={COLORS.spinner} />}
              </View>
              <View style={styles.requestActions}>
                <HapticPressable accessibilityRole="button" accessibilityLabel={`Approve ${request.firstName}’s return`}
                  disabled={!!reviewingId} onPress={() => reviewRequest(request, 'approve')} style={styles.approveButton}>
                  <Text maxFontSizeMultiplier={1.4} style={styles.approveLabel}>Approve</Text>
                </HapticPressable>
                <HapticPressable accessibilityRole="button" accessibilityLabel={`Decline ${request.firstName}’s return`}
                  disabled={!!reviewingId} onPress={() => reviewRequest(request, 'decline')} style={styles.declineButton}>
                  <Text maxFontSizeMultiplier={1.4} style={styles.declineLabel}>Decline</Text>
                </HapticPressable>
              </View>
            </View>)}
          </View>}
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Neighbors</Text>
            <View style={styles.countBadge}>
              <Text maxFontSizeMultiplier={1.4} style={styles.countText}>{members.length}</Text>
            </View>
            {!handoff && <HapticPressable accessibilityLabel="Invite neighbors" onPress={() => navigation.navigate('InviteMembers', { communityId })}
              style={{ marginLeft: 'auto', backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 12 }}><Text style={{ color: COLORS.surface }}>+ Invite</Text></HapticPressable>}
          </View>
        </>}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{handoff ? 'No eligible neighbors found. Go back to check the neighborhood again.' : 'No members yet'}</Text>
            {handoff && <ActionButton label="Back to neighborhood" onPress={() => navigation.goBack()} />}
          </View>
        }
        ListFooterComponent={handoff && moreCandidates ? <View style={{ marginTop: SPACING.md }}>
          {loadingMore ? <ActivityIndicator color={COLORS.spinner} /> : <ActionButton label="More neighbors" disabled={!!handoffId} onPress={loadMoreCandidates} />}
        </View> : null}
      />
      <ActionSheet isVisible={!!actionMember} onClose={() => setActionMember(null)} title={actionMember?.firstName}
        actions={actionMember ? [
          { label: 'Make steward', onPress: () => handlePromote(actionMember) },
          { label: 'Remove from neighborhood', destructive: true, onPress: () => handleRemove(actionMember) },
        ] : []} />
    </View>
  );
}

const styles = StyleSheet.create({
  requestsSection: { gap: SPACING.sm, marginBottom: SPACING.xl },
  requestDetail: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary },
  requestCard: { ...CARD_SURFACE, backgroundColor: COLORS.surface, borderRadius: RADIUS.md,   padding: SPACING.md, gap: SPACING.md },
  requestPerson: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  requestActions: { flexDirection: 'row', gap: SPACING.sm },
  approveButton: { flex: 1, minHeight: 44, padding: SPACING.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  approveLabel: { ...TYPOGRAPHY.subheadline, color: COLORS.surface, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
  declineButton: { flex: 1, minHeight: 44, padding: SPACING.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.borderBrown, borderRadius: RADIUS.full },
  declineLabel: { ...TYPOGRAPHY.subheadline, color: COLORS.error, fontWeight: '500', fontFamily: 'DMSans_500Medium', },
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
    fontWeight: '500',
    fontFamily: 'DMSans_500Medium',
  },
  memberRow: {
    ...CARD_SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
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
  promoteButtonText: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '500', flexShrink: 1, fontFamily: 'DMSans_500Medium', },
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
    fontWeight: '500',
    fontFamily: 'DMSans_500Medium',
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
