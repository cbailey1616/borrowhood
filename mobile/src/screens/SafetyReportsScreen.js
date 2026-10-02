import RefreshControl from '../components/HapticRefreshControl';
import ShimmerImage from '../components/ShimmerImage';
import TextInput from '../components/AppTextInput';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import LayeredCard from '../components/LayeredCard';
import ActionSheet from '../components/ActionSheet';
import SegmentedControl from '../components/SegmentedControl';
import { Ionicons } from '../components/Icon';
import { CARD_SURFACE, COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

const labels = { remove_content: 'Remove content', dismiss: 'Dismiss report', reopen: 'Reopen report', suspend: 'Suspend account', restore: 'Restore account' };
const explanations = {
  remove_content: 'Remove the reported post or message and its public replies. Exchange records remain available. This cannot be undone here.',
  dismiss: 'Close this report without changing account access.',
  reopen: 'Return this report to the open queue.',
  suspend: 'This person will lose access to Borrowhood. Existing exchange records stay available for follow-up.',
  restore: 'Allow this person to sign in again. This does not change their identity verification.',
};
const date = value => value ? new Date(value).toLocaleString() : '';

export default function SafetyReportsScreen({ navigation, route }) {
  const { user } = useAuth();
  const reportId = route?.params?.reportId;
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('open');
  const [data, setData] = useState({ reports: [], page: 1, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const loadVersion = useRef(0);
  const load = useCallback(async (page = 1) => {
    if (!user?.isAdmin) return;
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try {
      const result = await api.getSafetyReports(reportId ? 'all' : filter, page, reportId);
      if (version === loadVersion.current) {
        setData(previous => ({ ...result, reports: page === 1 ? result.reports : [...previous.reports, ...result.reports] }));
        if (reportId) setSelected(result.reports.find(report => report.id === reportId) || null);
      }
    } catch (e) { if (version === loadVersion.current) setError(e.message || 'Could not load reports.'); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [filter, reportId, user?.isAdmin]);
  useEffect(() => {
    setSelected(null); setNote(''); setData({ reports: [], page: 1, hasMore: false });
    load(); return () => { loadVersion.current++; };
  }, [load]);
  const choose = action => {
    Keyboard.dismiss();
    if (note.trim().length < 3) { setError('Add a review note before making a decision.'); return; }
    setError(''); setDecision(action);
  };
  const submit = async action => {
    if (inFlight.current || !selected) return;
    inFlight.current = true; setSaving(true); setError('');
    try {
      await api.reviewSafetyReport(selected.id, { action, note: note.trim(), version: selected.version });
      setSelected(null); setNote(''); await load();
    } catch (e) { setError(e.message || 'Could not save your decision. Refresh the report and try again.'); }
    finally { inFlight.current = false; setSaving(false); }
  };
  if (!user?.isAdmin) return <View style={styles.denied}><Text style={styles.body}>Administrator access is required.</Text></View>;
  return <View style={styles.container}>
    <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { if (!saving) { setSelected(null); load(); } }} tintColor={COLORS.spinner} colors={[COLORS.spinner]} />}>
      <View style={styles.heading}><View style={{ flex: 1 }}>
        <Text style={styles.title}>{reportId ? 'Report review' : 'Community safety'}</Text><Text style={styles.body}>Review reports and manage account access.</Text>
      </View></View>
      {!reportId && <SegmentedControl segments={['Open reports', 'All reports']} selectedIndex={filter === 'open' ? 0 : 1} onIndexChange={i => {
        if (saving) return; setSelected(null); setNote(''); setData({ reports: [], page: 1, hasMore: false }); setFilter(i ? 'all' : 'open');
      }} />}
      {!!error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        {!saving && <ActionButton label="Refresh reports" icon="refresh-outline" disabled={loading} onPress={() => { setSelected(null); load(); }} />}
      </View>}
      {loading && !data.reports.length && <ActivityIndicator color={COLORS.spinner} />}
      {!loading && !error && !data.reports.length && <LayeredCard style={styles.card}><Ionicons name="document-text-outline" size={28} color={COLORS.primary} /><Text style={styles.name}>{reportId ? 'This report is no longer available.' : filter === 'open' ? 'No open reports' : 'No reports yet'}</Text>{!reportId && <Text style={styles.body}>Reports submitted by members will appear here.</Text>}</LayeredCard>}
      {data.reports.map(report => <LayeredCard key={report.id} style={styles.card}>
        <HapticPressable haptic="selection" pressedBackgroundColor={COLORS.cardHover} disabled={saving} accessibilityLabel={`Review report about ${report.reportedName}`} onPress={() => {
          setSelected(selected?.id === report.id ? null : report); setNote(''); setError('');
        }} style={styles.reportHeader}>
          <View style={{ flex: 1 }}><Text style={styles.name}>{report.reportedName}</Text><Text style={styles.reason}>{report.reason}</Text>
            <Text style={styles.caption}>{date(report.createdAt)} · {report.status}</Text></View>
          <Ionicons name={selected?.id === report.id ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.primary} />
        </HapticPressable>
        {selected?.id === report.id && <View style={styles.detail}>
          {!!report.contentSnapshot && <View style={styles.history}>
            <Text style={styles.reason}>{report.contentSnapshot.title}</Text>
            <Text style={styles.body}>{report.contentSnapshot.content}</Text>
            {report.contentSnapshot.photos?.map((uri, index) => <ShimmerImage key={index} source={{ uri }}
              accessibilityLabel="Reported photo" style={{ width: '100%', height: 260, borderRadius: 12, marginTop: 12 }} resizeMode="contain" />)}
          </View>}
          <Text style={styles.body}>Reported by {report.reporterName}</Text>
          {report.contentType==='exchange'&&<Text style={styles.body}>Exchange report · submitted by the {report.contentSnapshot?.reporterRole||'neighbor'}. Account review only.</Text>}
          <Text style={styles.body}>Account: {report.accountStatus || 'Deleted'} · {report.reportCount} total reports</Text>
          <Text style={styles.body}>{report.activeExchanges} active exchanges</Text>
          {!!report.reportedId && <ActionButton label="View reported profile" icon="person-outline" disabled={saving} onPress={() => navigation.navigate('UserProfile', { id: report.reportedId })} />}
          {report.history?.map((entry, i) => <View key={i} style={styles.history}><Text style={styles.reason}>{labels[entry.action]} · {entry.adminName}</Text><Text style={styles.body}>{entry.note}</Text><Text style={styles.caption}>{date(entry.createdAt)}</Text></View>)}
          <Text style={styles.reason}>Review note</Text>
          <TextInput accessibilityLabel="Review note" multiline value={note} onChangeText={setNote} maxLength={2000} editable={!saving}
            placeholder="Explain your decision. Visible only to administrators." placeholderTextColor={COLORS.textSecondary} style={styles.input} />
          <Text style={styles.caption}>Every decision is saved with the reviewer and time. A report alone does not suspend an account.</Text>
          {report.contentId && report.contentType!=='exchange' && <ActionButton label="Remove content" destructive disabled={saving} icon="trash-outline" onPress={() => choose('remove_content')} />}
          {saving ? <ActivityIndicator color={COLORS.spinner} /> : <>
            {report.reportedId && !report.reportedIsAdmin && report.reportedId !== user.id && report.accountStatus !== 'suspended' &&
              <ActionButton label="Suspend account" variant="primary" destructive icon="ban-outline" onPress={() => choose('suspend')} />}
            {report.canRestore && !report.reportedIsAdmin && <ActionButton label="Restore account" variant="primary" icon="checkmark-circle-outline" onPress={() => choose('restore')} />}
            <ActionButton label={report.status === 'open' ? 'Dismiss report' : 'Reopen report'} onPress={() => choose(report.status === 'open' ? 'dismiss' : 'reopen')} />
          </>}
        </View>}
      </LayeredCard>)}
      {data.hasMore && <ActionButton label="Load more reports" disabled={loading || saving} loading={loading} onPress={() => load(data.page + 1)} />}
    </ScrollView>
    {!!decision && <ActionSheet isVisible variant="confirmation" title={`${labels[decision]}?`} message={explanations[decision]}
      icon={<Ionicons name="shield-outline" size={24} color={COLORS.primary} />} onClose={() => setDecision(null)}
      actions={[{ label: labels[decision], destructive: ['suspend','remove_content'].includes(decision), primary: !['suspend','remove_content'].includes(decision), onPress: () => submit(decision) }]} />}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, denied: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: COLORS.background },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' }, heading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { ...TYPOGRAPHY.title2, lineHeight: 32, color: COLORS.primary }, name: { ...TYPOGRAPHY.h3, color: COLORS.text },
  body: { color: COLORS.textSecondary, ...TYPOGRAPHY.subheadline, lineHeight: 23 }, reason: { color: COLORS.text, ...TYPOGRAPHY.buttonSmall, lineHeight: 22 },
  caption: { color: COLORS.textSecondary, ...TYPOGRAPHY.footnote, lineHeight: 20 }, card: { padding: 18, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, gap: 8 },
  reportHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 52 }, detail: { gap: 12, paddingTop: 12 },
  input: { minHeight: 112, padding: 14, borderRadius: RADIUS.md, color: COLORS.text, backgroundColor: COLORS.surfaceElevated, ...TYPOGRAPHY.body, textAlignVertical: 'top' },
  action: { minHeight: 52, padding: 14, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  link: { color: COLORS.primary, ...TYPOGRAPHY.button }, secondaryAction: { borderWidth: 1, borderColor: COLORS.borderGreen }, primaryAction: { backgroundColor: COLORS.primary },
  primaryText: { color: COLORS.surface, ...TYPOGRAPHY.button }, dangerAction: { backgroundColor: COLORS.dangerMuted }, error: { color: COLORS.danger, ...TYPOGRAPHY.subheadline, lineHeight: 23 },
  errorBox: { ...CARD_SURFACE, padding: 16, backgroundColor: COLORS.dangerMuted, borderRadius: RADIUS.md }, history: { ...CARD_SURFACE, padding: 14, gap: 6, backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.md },
});
