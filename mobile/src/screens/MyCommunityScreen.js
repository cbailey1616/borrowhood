import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import HapticPressable from '../components/HapticPressable';
import LayeredCard from '../components/LayeredCard';
import CommunityChat from '../components/CommunityChat';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function MyCommunityScreen({ navigation, route }) {
  const { user } = useAuth();
  const [membership, setMembership] = useState({ userId: null, communities: [], loading: true, error: false });
  const [selectedId, setSelectedId] = useState(route?.params?.communityId || null);
  const [reload, setReload] = useState(0);
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

  if (!community && loading) return <View style={styles.loading}><ActivityIndicator color={COLORS.primary} accessibilityLabel="Loading your neighborhood" /></View>;

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

  return <CommunityChat key={`${user?.id}:${community.id}`} community={community} navigation={navigation} header={<View>
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
      {community.bannerUrl && <Image source={{ uri: community.bannerUrl }} style={styles.cover} accessibilityLabel={`${community.name} cover`} />}
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
  </View>} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
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
  cover: { width: '100%', height: 92, borderRadius: RADIUS.lg, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1, minWidth: 0 },
  name: { ...TYPOGRAPHY.h2, color: COLORS.text },
  button: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.primary },
  buttonText: { ...TYPOGRAPHY.footnote, color: COLORS.surface },
  members: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', minHeight: 44 },
  description: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
