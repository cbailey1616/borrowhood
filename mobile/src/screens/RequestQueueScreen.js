import { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
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
  const { width, fontScale } = useWindowDimensions();
  const stackActions = width / fontScale < 340;
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
    ? <View style={{ gap: SPACING.md }}><Text style={styles.body}>Couldn’t load requests.</Text><HapticPressable accessibilityRole="button" onPress={load} style={styles.outline}><Text style={styles.action}>Try again</Text></HapticPressable></View>
    : <ActivityIndicator color={COLORS.primary} />}</View>;
  const availability = listingAvailability(data.listing);
  return <View style={{ flex: 1, backgroundColor: COLORS.background }}>
    <FlatList contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}
      data={data.requests} keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
      ListHeaderComponent={<View style={{ gap: SPACING.sm, marginBottom: SPACING.lg }}>
        <View style={styles.headingRow}>
          <Text style={styles.title}>{data.listing.title}</Text>
          <Text style={styles.count}>{data.requests.length} waiting</Text>
        </View>
        {data.requests.length > 1 && <Text style={styles.body}>Oldest first</Text>}
        {!availability.available && <Text style={styles.body}>{availability.label}. Approve another request when it’s available.</Text>}
        {!!data.activeTransactionId && <HapticPressable accessibilityRole="button" onPress={() => navigation.replace('TransactionDetail', { id: data.activeTransactionId })} style={styles.outline}><Text style={styles.action}>View current exchange</Text></HapticPressable>}
        {error && <Text accessibilityRole="alert" style={styles.body}>Couldn’t refresh. Pull down to try again.</Text>}
      </View>}
      ListEmptyComponent={<Text style={styles.body}>No requests waiting.</Text>}
      renderItem={({ item }) => <LayeredCard style={{ marginBottom: SPACING.md }}>
        <View style={styles.card}>
          <View style={styles.personRow}>
            <ShimmerImage source={item.borrower.profilePhotoUrl ? { uri: item.borrower.profilePhotoUrl } : null} placeholderIcon="person" style={styles.avatar} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <MemberSummary user={item.borrower} showExchangeCount={false} compact>
                <HapticPressable style={styles.profileName} accessibilityRole="button" accessibilityLabel={`View ${item.borrower.firstName}'s profile${item.borrower.isVerified === true ? ', verified identity' : ''}`} onPress={() => navigation.navigate('UserProfile', { id: item.borrower.id })}>
                  <Text style={styles.name}>{item.borrower.firstName}</Text>
                  {item.borrower.isVerified === true && <VerifiedBadge size={18} />}
                </HapticPressable>
              </MemberSummary>
              {!['giveaway', 'sell'].includes(data.listing.listingType) && (item.startDate || item.endDate) && <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={15} color={COLORS.textSecondary} />
                <Text style={styles.date}>{[date(item.startDate), date(item.endDate)].filter(Boolean).join(' – ')}</Text>
              </View>}
            </View>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Open ${item.borrower.firstName}'s profile`} style={styles.profileArrow} onPress={() => navigation.navigate('UserProfile', { id: item.borrower.id })}>
              <View style={styles.arrowCircle}><Ionicons name="chevron-forward" size={15} color={COLORS.primary} /></View>
            </HapticPressable>
          </View>
          {!!item.message && <Text style={styles.body}>{item.message}</Text>}
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Approve ${item.borrower.firstName}'s request`} testID={`Queue.approve.${item.id}`}
              disabled={!(item.canChoose ?? availability.available) || !!busy || error}
              onPress={() => decide(item, true)} style={[styles.approve, { opacity: (item.canChoose ?? availability.available) && !busy && !error ? 1 : 0.45 }]}>
              {busy === item.id ? <ActivityIndicator color={COLORS.surface} /> : <><Ionicons name="checkmark" size={20} color={COLORS.surface} /><Text style={styles.approveText}>Approve request</Text></>}
            </HapticPressable>
          <View testID={`Queue.actions.${item.id}`} style={[styles.actionRow, stackActions && { flexDirection: 'column' }]}>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Message ${item.borrower.firstName}`} style={[styles.secondary, { flex: stackActions ? 0 : 1.12 }]} onPress={() => navigation.navigate('Chat', { recipientId: item.borrower.id, recipient: item.borrower, listingId, listing: data.listing })}><Ionicons name="chatbubble" size={15} color={COLORS.primary} /><Text style={styles.secondaryText}>Message</Text></HapticPressable>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`View ${item.borrower.firstName}'s request`} style={[styles.secondary, stackActions && { flex: 0 }]} onPress={() => navigation.navigate('TransactionDetail', { id: item.id })}><Text style={styles.secondaryText}>Details</Text></HapticPressable>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Decline ${item.borrower.firstName}'s request`} testID={`Queue.decline.${item.id}`}
              disabled={!!busy || error} style={[styles.secondary, stackActions && { flex: 0 }, { backgroundColor: COLORS.background }, (busy || error) && { opacity: 0.45 }]} onPress={() => setDeclining(item)}><Text style={[styles.secondaryText, { color: COLORS.danger }]}>Decline</Text></HapticPressable>
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
  action: { ...TYPOGRAPHY.subheadline, color: COLORS.primary, fontWeight: '400' },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h2, color: COLORS.text, flexShrink: 1 },
  count: { ...TYPOGRAPHY.caption1, color: COLORS.primary, backgroundColor: COLORS.primaryMuted, paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.lg, overflow: 'hidden' },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 16, gap: 10 },
  personRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  avatar: { width: 44, height: 48, borderRadius: 16 },
  profileName: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  name: { ...TYPOGRAPHY.subheadline, fontWeight: '400', fontFamily: 'DMSans_400Regular', color: COLORS.text, flexShrink: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  date: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, flexShrink: 1 },
  profileArrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', gap: 6 },
  secondary: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 4, paddingVertical: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...TYPOGRAPHY.caption1, color: COLORS.primary, textAlign: 'center', flexShrink: 1 },
  outline: { minHeight: 48, borderWidth: 1, borderColor: COLORS.borderGreenStrong, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  approve: { minHeight: 49, padding: 12, flexDirection: 'row', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  approveText: { ...TYPOGRAPHY.button, color: COLORS.surface, flexShrink: 1, textAlign: 'center' },
};
