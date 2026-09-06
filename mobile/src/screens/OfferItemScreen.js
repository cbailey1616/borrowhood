import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from '../components/HapticPressable';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function OfferItemScreen({ route, navigation }) {
  const { request } = route.params;
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(null);
  const load = async () => {
    setLoading(true); setError(null);
    try { setItems((await api.getMyListings()).filter(i => i.status === 'active' && i.isAvailable)); }
    catch { setError('Could not load your inventory.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const offer = item => Alert.alert(`Offer ${item.title}?`,
    'Only this requester will receive access to this item for up to 14 days while their request is open. Your inventory and pickup address remain private.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send private offer', onPress: async () => {
        setSending(item.id);
        try {
          await api.offerItem(request.id, item.id);
          Alert.alert('Private offer sent', 'You can withdraw it from the request page.');
          navigation.goBack();
        } catch (e) { Alert.alert('Could not send offer', e.message); }
        finally { setSending(null); }
      } },
    ]);
  return <View style={[styles.container, { paddingBottom: insets.bottom }]}>
    <Text style={styles.heading}>Choose one item to offer</Text>
    <Text style={styles.hint}>For “{request.title}”. Nothing else in your inventory is shared.</Text>
    {loading ? <ActivityIndicator color={COLORS.primary} /> : error ?
      <HapticPressable onPress={load} style={styles.row}><Text>{error} Tap to retry.</Text></HapticPressable> :
      <FlatList data={items} keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={styles.hint}>No available items yet. Add one privately below.</Text>}
        renderItem={({ item }) => <HapticPressable style={styles.row} disabled={Boolean(sending)} onPress={() => offer(item)}>
          {item.photoUrl || item.photos?.[0] ? <Image source={{ uri: item.photoUrl || item.photos[0] }} accessibilityLabel={item.title} style={{ width: 52, height: 52, borderRadius: 12 }} /> : <Ionicons name="cube" size={36} color={COLORS.primary} />}
          <Text style={styles.itemTitle}>{item.title}</Text>
          {sending === item.id ? <ActivityIndicator color={COLORS.primary} /> : <Ionicons name="chevron-forward" size={20} />}
        </HapticPressable>} />}
    <HapticPressable style={styles.row} disabled={Boolean(sending)} onPress={() => navigation.navigate('CreateListing', { requestMatch: request })}>
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
