import RefreshControl from '../components/AppRefreshControl';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, AppState, } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '../context/AuthContext';
import HapticPressable from '../components/HapticPressable';
import LayeredCard from '../components/LayeredCard';
import BackHeader from '../components/BackHeader';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { COVER_ASPECT } from '../utils/coverCrop';

export default function MyCommunityScreen({ navigation, route }) {
  const { user } = useAuth();
  const [membership, setMembership] = useState({ userId: null, communities: [], loading: true, error: false });
  const [selectedId, setSelectedId] = useState(route?.params?.communityId || null);
  const [reload, setReload] = useState(0);
  const [chat, setChat] = useState({ key: null, data: null, loading: true, error: false });
  const [failedCover, setFailedCover] = useState(null);
  const requestedId = route?.params?.communityId;
  const retry = () => setReload(n => n + 1);

  useFocusEffect(useCallback(() => {
    let active = true;
    const userId = user?.id;
    setMembership(old => ({ userId, communities: old.userId === userId ? old.communities : [], loading: true, error: false }));
    api.getCommunities({ member: 'true' }).then(result => {
      if (!active) return;
      if (!Array.isArray(result)) throw new Error('Invalid membership response');
      // This endpoint already returns explicit memberships. Older neighborhoods
      // may carry a geographic town label; that does not change membership.
      setMembership({ userId, communities: result, loading: false, error: false });
      setSelectedId(old => requestedId && result.some(c => c.id === requestedId)
        ? requestedId : result.some(c => c.id === old) ? old : result[0]?.id);
    }).catch(() => {
      if (active) setMembership(old => ({ ...old, loading: false, error: true }));
    });
    return () => { active = false; };
  }, [user?.id, requestedId, reload]));

  const currentUser = membership.userId === user?.id;
  const communities = currentUser ? membership.communities : [];
  const community = communities.find(c => c.id === selectedId) || communities[0];
  const loading = !currentUser || membership.loading;
  const error = currentUser && membership.error;
  const communityId = community?.id;
  const chatKey = `${user?.id}:${communityId}`;
  const canManage = !!community && (community.role === 'organizer' || user?.isAdmin);
  const coverKey = `${user?.id}:${communityId}:${community?.bannerUrl}`;

  useLayoutEffect(() => {
    navigation.setOptions?.({ header: props => <BackHeader navigation={props.navigation} title="My Neighborhood"
      rightElement={canManage ? <HapticPressable style={styles.manage} accessibilityRole="button" accessibilityLabel="Manage neighborhood"
        onPress={() => navigation.navigate('CommunitySettings', { id: communityId })}>
        <Text style={styles.manageText}>Manage</Text>
      </HapticPressable> : null} /> });
  }, [navigation, communityId, canManage]);

  useFocusEffect(useCallback(() => {
    if (!communityId) return undefined;
    let active = true;
    let request = 0;
    setChat(old => old.key === chatKey ? old : { key: chatKey, data: null, loading: true, error: false });
    const refresh = async () => {
      const current = ++request;
      try {
        const data = await api.getCommunityChatSummary(communityId);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid chat preview');
        if (active && current === request) setChat({ key: chatKey, data, loading: false, error: false });
      } catch {
        if (active && current === request) setChat({ key: chatKey, data: null, loading: false, error: true });
      }
    };
    refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [communityId, chatKey, reload]));

  const preview = chat.key === chatKey ? chat : null;
  const unreadCount = Math.max(0, Number(preview?.data?.unreadCount) || 0);
  const chatNote = !preview || preview.loading ? 'Loading chat…' : preview.error ? 'Open neighborhood chat'
    : preview.data?.lastMessage || 'Say hello to your neighbors.';

  if (!community && loading) return <View style={styles.loading}><ActivityIndicator color={COLORS.spinner} accessibilityLabel="Loading your neighborhood" /></View>;

  if (!community) return <ScrollView style={styles.page} contentContainerStyle={styles.stateContent}>
    <LayeredCard style={styles.stateCard} radius={RADIUS.xl}>
      <View style={styles.stateIcon}><Ionicons name="home" size={44} illustrated color={COLORS.primary} /></View>
      <Text style={styles.stateTitle} accessibilityRole="header">{error ? 'Couldn’t load your neighborhood' : 'Meet your neighbors'}</Text>
      <Text style={styles.stateDescription}>{error ? 'Check your connection and try again.' : 'Join a neighborhood to chat and share.'}</Text>
      <HapticPressable accessibilityRole="button" style={styles.stateButton}
        onPress={error ? retry : () => navigation.navigate('JoinCommunity')}>
        <Text style={styles.stateButtonText}>{error ? 'Try again' : 'Find your neighborhood'}</Text>
        {!error && <Ionicons name="arrow-forward" size={20} color={COLORS.surface} />}
      </HapticPressable>
    </LayeredCard>
  </ScrollView>;

  return <ScrollView style={styles.page} contentContainerStyle={styles.overviewContent}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={retry} tintColor={COLORS.spinner} colors={[COLORS.spinner]} />}>
    {error && <HapticPressable accessibilityRole="button" accessibilityLabel="Retry loading neighborhoods" style={styles.refreshError} onPress={retry}>
      <Text style={styles.description}>Couldn’t refresh. Tap to retry.</Text>
    </HapticPressable>}
    {communities.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selector}>
      {communities.map(c => <HapticPressable key={c.id} onPress={() => setSelectedId(c.id)} accessibilityRole="button"
        accessibilityState={{ selected: c.id === community.id }} style={[styles.chip, c.id === community.id && styles.selected]}>
        <Text style={{ color: c.id === community.id ? COLORS.surface : COLORS.primary }}>{c.name}</Text>
      </HapticPressable>)}
    </ScrollView>}
    <View style={styles.hero}>
      {community.bannerUrl && failedCover !== coverKey
        ? <Image source={{ uri: community.bannerUrl }} style={styles.cover} resizeMode="cover"
          accessibilityLabel={`${community.name} cover`} onError={() => setFailedCover(coverKey)} />
        : (community.bannerUrl || canManage) && <HapticPressable style={[styles.cover, styles.coverFallback]} accessibilityRole="button"
          onPress={community.bannerUrl ? () => { setFailedCover(null); retry(); }
            : () => navigation.navigate('CommunitySettings', { id: community.id, editCover: true })}>
          <Ionicons name={community.bannerUrl ? 'refresh-outline' : 'camera-outline'} size={26} color={COLORS.primary} />
          <Text style={styles.description}>{community.bannerUrl ? 'Reload cover photo' : 'Add cover photo'}</Text>
        </HapticPressable>}
      <View style={styles.titleRow}>
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={2} accessibilityRole="header">{community.name}</Text>
          <HapticPressable style={styles.members} accessibilityRole="button" accessibilityLabel="View neighbors"
            onPress={() => navigation.navigate('CommunityMembers', { id: community.id, role: community.role })}>
            <Ionicons name="people-outline" size={18} color={COLORS.primary} />
            <Text style={styles.description}>{community.memberCount ?? 0} neighbors</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
          </HapticPressable>
        </View>
        <HapticPressable style={styles.button} accessibilityRole="button" accessibilityLabel="Invite neighbors"
          onPress={() => navigation.navigate('InviteMembers', { communityId: community.id })}>
          <Text style={styles.buttonText}>+ Invite</Text>
        </HapticPressable>
      </View>
    </View>
    <View style={styles.shortcuts}>
      <HapticPressable style={styles.shortcut} accessibilityRole="button" accessibilityLabel="Neighborhood chat"
        accessibilityHint={unreadCount ? `${unreadCount} unread messages` : 'Open your neighborhood chat'}
        onPress={() => navigation.navigate('CommunityChat', { communityId: community.id, communityName: community.name })}>
        <View style={styles.shortcutIcon}><Ionicons name="chatbubble-ellipses" size={30} illustrated color={COLORS.primary} /></View>
        <View style={styles.shortcutText}>
          <Text style={styles.shortcutTitle}>Neighborhood chat</Text>
          <Text style={styles.description} numberOfLines={2}>{chatNote}</Text>
        </View>
        {unreadCount > 0 && <View style={styles.unread}><Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
        <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
      </HapticPressable>
      <HapticPressable style={styles.shortcut} accessibilityRole="button" accessibilityLabel="Neighborhood items"
        onPress={() => navigation.navigate('Main', { screen: 'Feed', params: {
          neighborhoodItems: { id: community.id, name: community.name, requestId: randomUUID() },
        } })}>
        <View style={styles.shortcutIcon}><Ionicons name="basket" size={30} illustrated color={COLORS.primary} /></View>
        <View style={styles.shortcutText}>
          <Text style={styles.shortcutTitle}>Neighborhood items</Text>
          <Text style={styles.description}>Browse items shared here.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
      </HapticPressable>
      {!!community.announcement?.trim() && <LayeredCard style={styles.announcement} radius={RADIUS.lg}>
        <Text style={styles.announcementTitle} accessibilityRole="header">Announcement</Text>
        <Text style={styles.announcementBody}>{community.announcement}</Text>
      </LayeredCard>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  overviewContent: { paddingBottom: 40 },
  manage: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  manageText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  stateContent: { padding: SPACING.lg, paddingTop: 28, paddingBottom: 40, alignItems: 'center' },
  stateCard: { width: '100%', maxWidth: 480, padding: 24, alignItems: 'center' },
  stateIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  stateTitle: { ...TYPOGRAPHY.h2, color: COLORS.text, textAlign: 'center' },
  stateDescription: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  stateButton: { minHeight: 52, width: '100%', marginTop: 24, paddingHorizontal: 18, paddingVertical: 14, borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateButtonText: { ...TYPOGRAPHY.body, color: COLORS.surface, textAlign: 'center', flexShrink: 1 },
  refreshError: { paddingHorizontal: SPACING.lg, paddingVertical: 12, minHeight: 44 },
  selector: { padding: SPACING.md, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.surface },
  selected: { backgroundColor: COLORS.primary },
  hero: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  cover: { width: '100%', aspectRatio: COVER_ASPECT, borderRadius: RADIUS.lg, marginBottom: 12 },
  coverFallback: { backgroundColor: COLORS.primaryMuted, justifyContent: 'center', alignItems: 'center', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1, minWidth: 0 },
  name: { ...TYPOGRAPHY.h2, color: COLORS.text },
  button: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.primary },
  buttonText: { ...TYPOGRAPHY.footnote, color: COLORS.surface },
  members: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', minHeight: 44 },
  description: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  shortcuts: { padding: SPACING.lg, gap: SPACING.md },
  shortcut: { minHeight: 100, padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  shortcutIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  shortcutText: { flex: 1, minWidth: 0, gap: SPACING.xs },
  shortcutTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
  unread: { minWidth: 24, minHeight: 24, paddingHorizontal: 6, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  unreadText: { ...TYPOGRAPHY.caption1, color: COLORS.surface },
  announcement: { padding: SPACING.lg, gap: SPACING.sm },
  announcementTitle: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  announcementBody: { ...TYPOGRAPHY.body, color: COLORS.text },
});
