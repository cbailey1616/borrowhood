import ListingTypeIcon from '../components/ListingTypeIcon';
import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import useNavigationTask from '../hooks/useNavigationTask';
import { View, Text, Image, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from '../components/HapticPressable';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function OfferItemScreen({ route, navigation }) {
  const { request } = route.params;
  const startNavigationTask = useNavigationTask(navigation, request.id);
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(null);
  const [canOffer, setCanOffer] = useState(false);
  const load = useCallback(async () => {
    const isCurrent = startNavigationTask();
    setLoading(true); setError(null); setCanOffer(false);
    try {
      const current = await api.getRequest(request.id);
      if (current.status !== 'open' || current.isExpired) throw new Error('This wanted post has ended. Ask the person who posted to renew it.');
      if (current.ownerMasked || current.isOwner) throw new Error('This wanted post is not available for a private offer.');
      const available = (await api.getMyListings()).filter(i => i.status === 'active' && i.isAvailable);
      if (!isCurrent()) return;
      setItems(available);
      setCanOffer(true);
    }
    catch (e) { if (isCurrent()) { setItems([]); setError(e.message || 'Could not load this wanted post and your inventory.'); } }
    finally { if (isCurrent()) setLoading(false); }
  }, [request.id, startNavigationTask]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const offer = item => Alert.alert(`Offer ${item.title}?`,
    'Only the person who posted will receive access to this item for up to 14 days while their wanted post is open. Your inventory and pickup address remain private.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send private offer', onPress: async () => {
        const isCurrent = startNavigationTask();
        setSending(item.id);
        try {
          await api.offerItem(request.id, item.id);
          if (!isCurrent()) return;
          Alert.alert('Private offer sent', 'You can withdraw it from the wanted post.');
          navigation.goBack();
        } catch (e) {
          Alert.alert('Could not send offer', e.message || 'Please try again.');
          if ([404, 409, 410].includes(e.status)) await load();
        }
        finally { setSending(null); }
      } },
    ]);
  return <View style={[styles.container, { paddingBottom: insets.bottom }]}>
    <Text style={styles.heading}>Choose one item to offer</Text>
    <Text style={styles.hint}>For “{request.title}”. Nothing else in your inventory is shared.</Text>
    {loading ? <ActivityIndicator color={COLORS.spinner} /> : error ?
      <HapticPressable onPress={load} style={styles.row}><Text>{error} Tap to retry.</Text></HapticPressable> :
      <FlatList data={items} keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={styles.hint}>No available items yet. Add one privately below.</Text>}
        renderItem={({ item }) => <HapticPressable style={styles.row} disabled={Boolean(sending)} onPress={() => offer(item)}>
          {item.photoUrl || item.photos?.[0] ? <Image source={{ uri: item.photoUrl || item.photos[0] }} accessibilityLabel={item.title} style={{ width: 52, height: 52, borderRadius: 12 }} /> : <ListingTypeIcon listing={item} size={36} />}
          <Text style={styles.itemTitle}>{item.title}</Text>
          {sending === item.id ? <ActivityIndicator color={COLORS.spinner} /> : <Ionicons name="chevron-forward" size={20} />}
        </HapticPressable>} />}
    <HapticPressable style={styles.row} disabled={Boolean(sending) || !canOffer} onPress={() => navigation.navigate('CreateListing', { requestMatch: request })}>
      <Ionicons name="add-circle" size={24} /><Text style={styles.itemTitle}>Add a new item privately</Text>
    </HapticPressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg, gap: SPACING.md },
  heading: { ...TYPOGRAPHY.h2, color: COLORS.text },
  hint: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  itemTitle: { ...TYPOGRAPHY.headline, flex: 1, color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 64, padding: SPACING.md,
    borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
});
import { ThemedAlert as Alert } from "../components/ThemedAlert";
