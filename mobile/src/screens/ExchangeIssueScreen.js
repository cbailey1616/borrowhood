import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import ActionButton from '../components/ActionButton';
import TextInput from '../components/AppTextInput';
import HapticPressable from '../components/HapticPressable';
import { Ionicons } from '../components/Icon';
import LayeredCard from '../components/LayeredCard';
import ShimmerImage from '../components/ShimmerImage';
import useNavigationTask from '../hooks/useNavigationTask';
import { returnHelpGuidance } from '../utils/returnHelpGuidance';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export const REPORT_NOTICE = 'Reports are used to review account access and may lead to a ban. Borrowhood does not recover items, cover loss or damage, or resolve disputes.';
const reasons = [
  { key: 'non_return', label: 'Item wasn’t returned', icon: 'return-down-back-outline' },
  { key: 'damage', label: 'Item was damaged', icon: 'construct-outline' },
];

export default function ExchangeIssueScreen({ navigation, route }) {
  const id = route.params?.transactionId;
  const startTask = useNavigationTask(navigation, id);
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const flight = useRef(false);
  useEffect(() => { setReason(null); setDetail(''); setPhotos([]); setCompleted(false); setBusy(false); setPicking(false); }, [id]);

  const load = useCallback(async () => {
    const current = startTask();
    setLoading(true); setError('');
    try {
      const result = await api.getTransaction(id);
      if (current()) setTransaction(result);
    } catch (e) {
      if (current()) { setTransaction(null); setError(e.message || 'Could not load this exchange. Try again.'); }
    } finally { if (current()) setLoading(false); }
  }, [id, startTask]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = !!transaction?.actualPickupAt && !transaction?.actualReturnAt
    && ['picked_up', 'return_pending'].includes(transaction?.status)
    && !['sell', 'giveaway'].includes(transaction?.listingType || transaction?.listing?.listingType);
  const canReportMissing = returnHelpGuidance(transaction)?.canReport;
  const pickPhotos = async () => {
    if (flight.current || picking || photos.length >= 5) return;
    const current = startTask(); setPicking(true); setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true,
        selectionLimit: 5 - photos.length, quality: 0.8 });
      if (current() && !result.canceled) setPhotos(previous => [...previous, ...result.assets.map(asset => asset.uri)].slice(0, 5));
    } catch { if (current()) setError('Could not add photos. Please try again.'); }
    finally { if (current()) setPicking(false); }
  };
  const submit = async () => {
    if (flight.current || picking || !active || !reason || (reason === 'non_return' && !canReportMissing)) return;
    flight.current = true; setBusy(true); setError('');
    const current = startTask();
    try {
      const photoUrls = photos.length ? await api.uploadImages(photos, 'listings') : [];
      if (!current()) return;
      await api.reportExchangeIssue(id, { reason, detail: detail.trim(), photos: photoUrls });
      if (current()) setCompleted(true);
    } catch (e) { if (current()) setError(e.message || 'Could not send your report. Your details are still here. Try again.'); }
    finally { flight.current = false; if (current()) setBusy(false); }
  };

  if (completed) return <View style={styles.success}>
    <View style={styles.successIcon}><Ionicons name="checkmark-circle-outline" size={44} color={COLORS.primary} /></View>
    <Text style={styles.heading}>Report submitted</Text>
    <Text style={styles.body}>{REPORT_NOTICE}</Text>
    <ActionButton label="Done" variant="primary" onPress={() => navigation.goBack()} />
  </View>;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
    {loading ? <ActivityIndicator color={COLORS.spinner} accessibilityLabel="Loading exchange" /> : transaction && <LayeredCard style={styles.item}>
      <ShimmerImage source={transaction.listing?.photos?.[0] ? { uri: transaction.listing.photos[0] } : null}
        category={transaction.listing?.category} title={transaction.listing?.title} style={styles.itemPhoto} />
      <View style={styles.itemCopy}><Text style={styles.eyebrow}>This exchange</Text><Text style={styles.itemTitle}>{transaction.listing?.title}</Text></View>
    </LayeredCard>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!loading && !transaction && <ActionButton label="Try again" onPress={load} />}
    {!loading && transaction && !active && <Text style={styles.body}>This exchange is no longer awaiting a return. A new return issue cannot be reported here.</Text>}
    {!loading && active && <>
      <Text style={styles.heading}>What happened?</Text>
      <LayeredCard style={styles.reasons}>
        {reasons.filter(option => transaction.isLender || option.key !== 'non_return').map((option, index) => {
          const disabled = busy || picking || (option.key === 'non_return' && !canReportMissing);
          const selected = reason === option.key;
          return <HapticPressable key={option.key} accessibilityRole="radio" accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, disabled }} disabled={disabled}
            onPress={() => { setReason(option.key); setError(''); }}
            style={[styles.reason, index > 0 && styles.reasonBorder, selected && styles.selected]}>
            <Ionicons name={option.icon} size={24} color={disabled ? COLORS.textSecondary : COLORS.primary} />
            <View style={styles.reasonCopy}><Text style={[styles.reasonLabel, disabled && styles.disabledLabel]}>{option.label}</Text>
              {option.key === 'non_return' && !canReportMissing && <Text style={styles.caption}>Available after the agreed return date</Text>}
              {option.key === 'damage' && transaction.isBorrower && <Text style={styles.caption}>Report damage to the item you borrowed</Text>}
            </View>
            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? COLORS.primary : COLORS.border} />
          </HapticPressable>;
        })}
      </LayeredCard>
      <View style={styles.section}><Text style={styles.label}>Details <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput accessibilityLabel="Issue details" value={detail} onChangeText={setDetail} maxLength={2000} multiline
          editable={!busy} placeholder="Describe what happened" placeholderTextColor={COLORS.textSecondary} style={styles.input} />
      </View>
      <View style={styles.section}><Text style={styles.label}>Photos <Text style={styles.optional}>(optional)</Text></Text>
        {!!photos.length && <View style={styles.photos}>{photos.map((uri, index) => <View key={`${uri}:${index}`} style={styles.photoWrap}>
          <Image source={{ uri }} style={styles.photo} />
          <HapticPressable accessibilityLabel={`Remove photo ${index + 1}`} disabled={busy || picking}
            style={styles.removePhoto} onPress={() => setPhotos(previous => previous.filter((_, i) => i !== index))}>
            <Ionicons name="close" size={20} color={COLORS.primary} />
          </HapticPressable>
        </View>)}</View>}
        {photos.length < 5 && <ActionButton label="Add photos" icon="images-outline" disabled={busy || picking} loading={picking} onPress={pickPhotos} />}
      </View>
      <View style={styles.notice}><Ionicons name="shield-outline" size={22} color={COLORS.primary} /><Text style={[styles.caption, styles.noticeText]}>{REPORT_NOTICE}</Text></View>
      <ActionButton label="Submit report" variant="primary" icon="flag-outline" loading={busy}
        disabled={!reason || busy || picking || (reason === 'non_return' && !canReportMissing)} onPress={submit} />
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40, gap: SPACING.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  heading: { ...TYPOGRAPHY.title2, color: COLORS.primary }, body: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, lineHeight: 25 },
  item: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, itemPhoto: { width: 60, height: 68, borderRadius: RADIUS.md },
  itemCopy: { flex: 1, gap: 4 }, itemTitle: { ...TYPOGRAPHY.headline, color: COLORS.text }, eyebrow: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  reasons: { overflow: 'hidden' }, reason: { minHeight: 78, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reasonCopy: { flex: 1, gap: 4 }, reasonLabel: { ...TYPOGRAPHY.headline, color: COLORS.text }, reasonBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  selected: { backgroundColor: COLORS.primaryMuted }, disabledLabel: { color: COLORS.textSecondary },
  caption: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, lineHeight: 21 }, label: { ...TYPOGRAPHY.headline, color: COLORS.text },
  optional: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary }, section: { gap: 10 },
  input: { ...TYPOGRAPHY.body, minHeight: 112, padding: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, photoWrap: { width: 92, height: 92 }, photo: { width: 92, height: 92, borderRadius: RADIUS.md },
  removePhoto: { position: 'absolute', right: -6, top: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }, noticeText: { flex: 1 }, error: { ...TYPOGRAPHY.bodySmall, color: COLORS.danger },
  success: { flex: 1, justifyContent: 'center', padding: 28, gap: 20, backgroundColor: COLORS.background, maxWidth: 720, width: '100%', alignSelf: 'center' },
  successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryMuted },
});
