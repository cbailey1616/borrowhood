import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function CircleDetailScreen({ route, navigation }) {
  const { circleId } = route.params;
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(false);
  const [friends, setFriends] = useState([]);
  const [inviting, setInviting] = useState(false);
  const load = async () => {
    try { setGroup(await api.getCircle(circleId)); setError(false); }
    catch { setError(true); }
  };
  useFocusEffect(useCallback(() => { load(); }, [circleId]));
  const chooseInvite = async () => {
    try {
      const people = await api.getFriends();
      setFriends(people.filter(person => !group.members.some(member => member.id === person.id)));
      setInviting(true);
    } catch { Alert.alert('Could not load friends', 'Please try again.'); }
  };
  const invite = person => Alert.alert(`Invite ${person.firstName}?`,
    'If they accept, they can see items shared with this group. They cannot see anyone’s other inventory.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send invite', onPress: async () => {
        try { await api.inviteToCircle(circleId, person.id); Alert.alert('Invitation sent'); }
        catch (e) { Alert.alert('Could not invite', e.message); }
      } },
    ]);
  if (error) return <View style={styles.container}><HapticPressable onPress={load} style={styles.card}><Text>Could not load this group. Tap to retry.</Text></HapticPressable></View>;
  if (!group) return <ActivityIndicator color={COLORS.primary} style={{ margin: 32 }} />;
  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <Text style={styles.title}>{group.name}</Text>
    <Text style={styles.hint}>Invite-only. Members see only items explicitly shared with this group.</Text>
    {['owner', 'admin'].includes(group.userRole) && <HapticPressable style={styles.card} onPress={chooseInvite}>
      <Ionicons name="person-add" size={24} /><Text style={styles.label}>Invite a friend</Text>
    </HapticPressable>}
    <Text style={styles.title}>Members</Text>
    {group.members.map(person => <View key={person.id} style={styles.card}>
      <Text style={styles.label}>{person.firstName} {person.lastName}</Text>
      <Text style={styles.hint}>{person.role}</Text>
    </View>)}
    <Text style={styles.title}>Shared items</Text>
    {(group.items || []).length === 0 && <Text style={styles.hint}>No items shared with this group yet.</Text>}
    {(group.items || []).map(item => <HapticPressable key={item.id} style={styles.card} onPress={() => navigation.navigate('ListingDetail', { id: item.id })}>
      <Ionicons name="cube" size={24} /><Text style={styles.label}>{item.title}</Text>
    </HapticPressable>)}
    <ActionSheet isVisible={inviting} onClose={() => setInviting(false)} title="Invite a friend"
      message={friends.length ? 'Select someone to invite. They must accept before joining.' : 'Add a friend first, or everyone in your circle is already a member.'}
      actions={friends.map(person => ({ label: `${person.firstName} ${person.lastName || ''}`, onPress: () => invite(person) }))} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 44 },
  title: { ...TYPOGRAPHY.h2, color: COLORS.text },
  hint: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  label: { ...TYPOGRAPHY.headline, color: COLORS.text, flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface,
    padding: SPACING.md, minHeight: 56, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
});
import { ThemedAlert as Alert } from "../components/ThemedAlert";
