import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import HapticPressable from '../components/HapticPressable';
import CommunityChat from '../components/CommunityChat';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function MyCommunityScreen({ navigation, route }) {
  const { user } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [selectedId, setSelectedId] = useState(route?.params?.communityId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const requestedId = route?.params?.communityId;
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    api.getCommunities({ member: 'true' }).then(result => {
      const data = (result || []).filter(c => !c.communityType || c.communityType === 'neighborhood');
      if (!active) return;
      setCommunities(data || []); setError(false);
      setSelectedId(old => requestedId && data.some(c => c.id === requestedId) ? requestedId : data.some(c => c.id === old) ? old : data[0]?.id);
    }).catch(() => { if (active) { setError(true); setCommunities([]); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, requestedId, reload]));
  if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;
  if (error) return <View style={styles.center}><Text style={styles.description}>Could not load neighborhoods.</Text><HapticPressable style={styles.button} onPress={() => setReload(n => n + 1)}><Text style={styles.buttonText}>Try again</Text></HapticPressable></View>;
  const community = communities.find(c => c.id === selectedId);
  if (!community) return <View style={styles.center}><Ionicons name="home" size={56} illustrated /><Text style={styles.name}>No neighborhood yet</Text><HapticPressable style={styles.button} onPress={() => navigation.navigate('JoinCommunity')}><Text style={styles.buttonText}>Find your neighborhood</Text></HapticPressable></View>;
  return <CommunityChat key={`${user?.id}:${community.id}`} community={community} navigation={navigation} header={<View>
    {communities.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selector}>
      {communities.map(c => <HapticPressable key={c.id} onPress={() => setSelectedId(c.id)} accessibilityRole="button" accessibilityState={{ selected: c.id === community.id }} style={[styles.chip, c.id === community.id && styles.selected]}><Text style={{ color: c.id === community.id ? COLORS.surface : COLORS.primary }}>{c.name}</Text></HapticPressable>)}
    </ScrollView>}
    <View style={styles.hero}>
      {community.bannerUrl && <Image source={{ uri: community.bannerUrl }} style={styles.cover} accessibilityLabel={`${community.name} cover`} />}
      <View style={styles.titleRow}><Text style={styles.name} numberOfLines={2}>{community.name}</Text><HapticPressable style={styles.button} accessibilityLabel="Invite neighbors" onPress={() => navigation.navigate('InviteMembers', { communityId: community.id })}><Text style={styles.buttonText}>+ Invite</Text></HapticPressable></View>
      <HapticPressable style={styles.members} accessibilityLabel="View neighbors" onPress={() => navigation.navigate('CommunityMembers', { id: community.id, role: community.role })}><Ionicons name="people-outline" size={20} color={COLORS.primary} /><Text style={styles.description}>{community.memberCount ?? 0} neighbors</Text><Ionicons name="chevron-forward" size={16} color={COLORS.primary} /></HapticPressable>
    </View>
  </View>} />;
}
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16, backgroundColor: COLORS.background },
  selector: { padding: SPACING.md, gap: 8 }, chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.surface }, selected: { backgroundColor: COLORS.primary },
  hero: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }, cover: { width: '100%', height: 92, borderRadius: RADIUS.lg, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, name: { ...TYPOGRAPHY.title2, color: COLORS.text, flexShrink: 1, flexGrow: 1 },
  button: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.primary }, buttonText: { ...TYPOGRAPHY.footnote, color: COLORS.surface },
  members: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44 }, description: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
});
