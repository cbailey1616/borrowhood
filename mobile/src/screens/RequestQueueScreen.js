import { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '../components/Icon';
import { useFocusEffect } from '@react-navigation/native';
import HapticPressable from '../components/HapticPressable';
import ShimmerImage from '../components/ShimmerImage';
import MemberSummary from '../components/MemberSummary';
import VerifiedBadge from '../components/VerifiedBadge';
import LayeredCard from '../components/LayeredCard';
import ActionSheet from '../components/ActionSheet';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import { listingAvailability } from '../utils/listingAvailability';

const date = value => value ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
export default function RequestQueueScreen({ route, navigation }) {
  const { listingId } = route.params;
  const [data, setData] = useState(null);
  const [errorListingId, setErrorListingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [declining, setDeclining] = useState(null);
  const action = useRef(null);
  const focusSession = useRef(null);
  const loadVersion = useRef(0);
  const currentListingId = useRef(listingId);
  currentListingId.current = listingId;
  const error = errorListingId === listingId;
  const { showError, showToast } = useError();
  const load = useCallback(async () => {
    const session = focusSession.current;
    if (!session?.active || session.listingId !== listingId || currentListingId.current !== listingId) return;
    const version = ++loadVersion.current;
    const isCurrent = () => session?.active && session === focusSession.current
      && currentListingId.current === listingId && version === loadVersion.current;
    try {
      const result = await api.getRequestQueue(listingId);
      if (isCurrent()) { setData(result); setErrorListingId(null); }
    } catch {
      if (isCurrent()) setErrorListingId(listingId);
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  }, [listingId]);
  useFocusEffect(useCallback(() => {
    const session = { listingId, active: true };
    focusSession.current = session;
    action.current = null;
    setBusy(null);
    setDeclining(null);
    setRefreshing(false);
    load();
    return () => { session.active = false; };
  }, [listingId, load]));

  const decide = async (item, approve) => {
    const session = focusSession.current;
    const isCurrent = () => session?.active && session === focusSession.current
      && session.listingId === listingId && currentListingId.current === listingId;
    if (action.current || !isCurrent() || data?.listing.id !== listingId
      || !data.requests.some(request => request.id === item.id)) return;
    const decision = { session };
    action.current = decision;
    // A refresh started before this decision must not restore stale requests.
    loadVersion.current += 1;
    setRefreshing(false);
    setBusy(item.id);
    try {
      if (approve) await api.approveRental(item.id);
      else await api.declineRental(item.id);
      if (!isCurrent()) return;
      // A successful decision must not reappear if the following refresh fails.
      setData(current => current?.listing.id === listingId
        ? { ...current, requests: current.requests.filter(request => request.id !== item.id) } : current);
      await load();
      if (!isCurrent()) return;
      showToast(approve ? `Reserved for ${item.borrower.firstName}` : 'Request declined', 'success');
      if (approve) navigation.replace('TransactionDetail', { id: item.id });
    } catch (err) {
      if (!isCurrent()) return;
      showError({ message: err.message || 'Could not update this request. Refresh and try again.' });
      await load();
    } finally {
      if (action.current === decision) {
        action.current = null;
        if (isCurrent()) setBusy(null);
      }
    }
  };

  if (data?.listing.id !== listingId) return <View style={styles.center}>{error
    ? <HapticPressable accessibilityRole="button" onPress={load}><Text style={styles.body}>Couldn’t load requests. Tap to retry.</Text></HapticPressable>
    : <ActivityIndicator color={COLORS.primary} />}</View>;
  const availability = listingAvailability(data.listing);
  return <View style={{ flex: 1, backgroundColor: COLORS.background }}>
    <FlatList contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}
      data={data.requests} keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
      ListHeaderComponent={<View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
        <Text style={{ ...TYPOGRAPHY.h2, color: COLORS.text }}>{data.listing.title}</Text>
        <Text style={styles.body}>{data.requests.length} {data.requests.length === 1 ? 'person waiting' : 'people waiting'} · Oldest first</Text>
        {!availability.available && <Text style={styles.body}>{availability.label}. Approve another request when it’s available.</Text>}
        {!!data.activeTransactionId && <HapticPressable accessibilityRole="button" onPress={() => navigation.replace('TransactionDetail', { id: data.activeTransactionId })} style={styles.outline}><Text style={styles.action}>View current exchange</Text></HapticPressable>}
        {error && <Text accessibilityRole="alert" style={styles.body}>Couldn’t refresh. Pull down to try again.</Text>}
      </View>}
      ListEmptyComponent={<Text style={styles.body}>No requests waiting.</Text>}
      renderItem={({ item }) => <LayeredCard style={{ marginBottom: SPACING.md }}>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', gap: SPACING.md, alignItems: 'center' }}>
            <ShimmerImage source={item.borrower.profilePhotoUrl ? { uri: item.borrower.profilePhotoUrl } : null} placeholderIcon="person" style={{ width: 44, height: 44, borderRadius: 22 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <MemberSummary user={item.borrower}>
                <HapticPressable style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: COLORS.surface }} accessibilityRole="button" accessibilityLabel={`View ${item.borrower.firstName}'s profile${item.borrower.isVerified === true ? ', verified identity' : ''}`} onPress={() => navigation.navigate('UserProfile', { id: item.borrower.id })}>
                  <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.primary, flexShrink: 1 }}>{item.borrower.firstName}</Text>
                  {item.borrower.isVerified === true && <VerifiedBadge size={18} />}
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </HapticPressable>
              </MemberSummary>
            </View>
            <Text style={styles.body}>#{item.position}</Text>
          </View>
          {!['giveaway', 'sell'].includes(data.listing.listingType) && <Text style={styles.body}>{date(item.startDate)} – {date(item.endDate)}</Text>}
          {!!item.message && <Text style={styles.body}>{item.message}</Text>}
          <View style={styles.actionRow}>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Approve ${item.borrower.firstName}'s request`} testID={`Queue.approve.${item.id}`}
              disabled={!(item.canChoose ?? availability.available) || !!busy || error}
              onPress={() => decide(item, true)} style={[styles.approve, { flex: 1, opacity: (item.canChoose ?? availability.available) && !busy && !error ? 1 : 0.45 }]}>
              {busy === item.id ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.approveText}>Approve</Text>}
            </HapticPressable>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Message ${item.borrower.firstName}`} style={[styles.outline, { flex: 1 }]} onPress={() => navigation.navigate('Chat', { recipientId: item.borrower.id, recipient: item.borrower, listingId, listing: data.listing })}><Text style={styles.action}>Message</Text></HapticPressable>
          </View>
          <View style={styles.actionRow}>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`View ${item.borrower.firstName}'s request`} style={[styles.link, { flex: 1 }]} onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}><Text style={styles.action}>View request</Text></HapticPressable>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Decline ${item.borrower.firstName}'s request`} testID={`Queue.decline.${item.id}`}
              disabled={!!busy || error} style={[styles.link, (busy || error) && { opacity: 0.45 }]} onPress={() => setDeclining(item)}><Text style={[styles.action, { color: COLORS.danger }]}>Decline</Text></HapticPressable>
          </View>
        </View>
      </LayeredCard>} />
    <ActionSheet isVisible={!!declining} onClose={() => setDeclining(null)} variant="confirmation"
      title="Decline this request?" message={declining ? `${declining.borrower.firstName}’s request for ${data.listing.title} will be declined.` : ''}
      actions={[{ label: 'Decline request', destructive: true, testID: 'Queue.confirmDecline', onPress: () => declining && decide(declining, false) }]} />
  </View>;
}
const styles = {
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  body: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  action: { ...TYPOGRAPHY.subheadline, color: COLORS.primary, fontWeight: '600' },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
  actionRow: { flexDirection: 'row', gap: SPACING.md },
  outline: { minHeight: 48, borderWidth: 1, borderColor: COLORS.borderGreenStrong, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  approve: { minHeight: 48, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  approveText: { ...TYPOGRAPHY.button, color: COLORS.surface },
  link: { minHeight: 44, justifyContent: 'center' },
};
