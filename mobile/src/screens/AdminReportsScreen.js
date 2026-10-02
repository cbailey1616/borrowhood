import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RefreshControl from '../components/HapticRefreshControl';
import ActionButton from '../components/ActionButton';
import HapticPressable from '../components/HapticPressable';
import LayeredCard from '../components/LayeredCard';
import SegmentedControl from '../components/SegmentedControl';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

const issues = [
  { value: 'all', label: 'All issues' }, { value: 'non_return', label: 'Not returned' },
  { value: 'damage', label: 'Damaged' }, { value: 'other', label: 'Other reports' },
];
const states = ['pending', 'reviewed', 'all'];
const issueLabels = { non_return: 'Not returned', damage: 'Damaged', other: 'Other report' };
const emptyData = () => ({ reports: [], counts: null, page: 1, hasMore: false });
const date = value => value ? new Date(value).toLocaleString() : '';
const statusLabel = report => report.queueStatus === 'appeal' ? 'Appeal pending'
  : report.queueStatus === 'waiting' ? 'Waiting for response'
  : report.queueStatus === 'ready' ? (report.returnResolved ? 'Return recorded · review report' : 'Ready to review')
  : report.status === 'confirmed' ? 'Non-return confirmed'
  : report.status === 'dismissed' ? 'Dismissed' : 'Reviewed';

export default function AdminReportsScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [issue, setIssue] = useState('all');
  const [state, setState] = useState('pending');
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async (page = 1) => {
    if (!user?.isAdmin) return;
    const token = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await api.getAdminReports(issue, state, page);
      if (token !== generation.current) return;
      setData(previous => ({ ...result, reports: page === 1 ? result.reports :
        [...new Map([...previous.reports, ...result.reports].map(report => [`${report.source}:${report.id}`, report])).values()] }));
    } catch (e) {
      if (token === generation.current) setError(e.message || 'Could not load reports. Please try again.');
    } finally { if (token === generation.current) setLoading(false); }
  }, [issue, state, user?.id, user?.isAdmin]);
  useFocusEffect(useCallback(() => {
    setData(emptyData()); setError(''); setLoading(false); load();
    return () => { generation.current++; };
  }, [load]));
  const changeFilter = (setter, value) => {
    generation.current++; setData(emptyData()); setError(''); setter(value);
  };
  const open = report => report.source === 'return'
    ? navigation.navigate('ReturnHelp', { admin: true, reportId: report.id })
    : navigation.navigate('SafetyReports', { reportId: report.id });
  if (!user?.isAdmin) return <View style={styles.denied}><Text style={styles.body}>Administrator access is required.</Text></View>;
  const count = data.counts && (state === 'all' ? data.counts.total : state === 'reviewed'
    ? data.counts.reviewed : data.counts.ready + data.counts.waiting + data.counts.appeals);
  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={COLORS.spinner} colors={[COLORS.spinner]} />}>
    <View style={styles.heading}>
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.body}>Review evidence and decide account access.</Text>
    </View>
    <Text style={styles.caption}>Account moderation only. Borrowhood does not recover items, cover loss or damage, or resolve disputes.</Text>
    <View style={styles.filters}>
      {issues.map(option => <HapticPressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label}
        accessibilityState={{ selected: issue === option.value }} style={[styles.filter, issue === option.value && styles.selectedFilter]}
        onPress={() => { if (issue !== option.value) changeFilter(setIssue, option.value); }}>
        <Text style={[styles.filterText, issue === option.value && styles.selectedFilterText]}>{option.label}</Text>
      </HapticPressable>)}
    </View>
    <LayeredCard style={styles.stats}>
      {[['ready', 'Ready to review'], ['waiting', 'Waiting for response'], ['appeals', 'Appeals']].map(([key, label]) =>
        <View key={key} style={styles.stat} accessible accessibilityLabel={`${label}: ${data.counts ? data.counts[key] : 'Loading'}`}>
          <Text style={styles.number}>{data.counts ? data.counts[key] : '—'}</Text><Text style={styles.caption}>{label}</Text>
        </View>)}
    </LayeredCard>
    <SegmentedControl segments={['Pending', 'Reviewed', 'All reports']} selectedIndex={states.indexOf(state)}
      onIndexChange={index => changeFilter(setState, states[index])} />
    {count !== null && <Text style={styles.caption}>{count} {count === 1 ? 'report' : 'reports'}</Text>}
    {!!error && <LayeredCard style={styles.errorCard}>
      <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <ActionButton label="Try again" icon="refresh-outline" disabled={loading} onPress={() => load()} />
    </LayeredCard>}
    {loading && !data.reports.length && <ActivityIndicator color={COLORS.spinner} accessibilityLabel="Loading reports" />}
    {!loading && !error && !data.reports.length && <LayeredCard style={styles.card}>
      <Ionicons name="checkmark-circle-outline" size={28} color={COLORS.primary} />
      <Text style={styles.name}>{state === 'pending' ? 'No pending reports' : state === 'reviewed' ? 'No reviewed reports' : 'No reports yet'}</Text>
      <Text style={styles.body}>Reports for this issue will appear here.</Text>
    </LayeredCard>}
    {data.reports.map(report => <LayeredCard key={`${report.source}:${report.id}`} style={styles.card}>
      <HapticPressable accessibilityRole="button" accessibilityLabel={`Review ${issueLabels[report.issue].toLowerCase()} report for ${report.title} by ${report.reporterName}`}
        onPress={() => open(report)} style={styles.report}>
        <View style={styles.reportCopy}>
          <Text style={styles.issue}>{issueLabels[report.issue]}</Text>
          <Text style={styles.name}>{report.title}</Text>
          <Text style={styles.body}>About {report.reportedName} · reported by {report.reporterName}</Text>
          {report.reporterRole === 'borrower' && <Text style={styles.caption}>Borrower disclosure</Text>}
          {report.issue === 'other' && <Text style={styles.body}>{report.reason}</Text>}
          <Text style={[styles.status, report.queueStatus === 'appeal' && styles.appeal]}>{statusLabel(report)}</Text>
          {report.queueStatus === 'waiting' && <Text style={styles.caption}>Response due {date(report.responseDueAt)}</Text>}
          {!!report.detail && <Text numberOfLines={2} style={styles.body}>{report.detail}</Text>}
          <Text style={styles.caption}>{date(report.createdAt)}{report.photoCount ? ` · ${report.photoCount} ${report.photoCount === 1 ? 'photo' : 'photos'}` : ''}</Text>
          {report.accountStatus === 'suspended' && <Text style={styles.caption}>Account suspended</Text>}
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
      </HapticPressable>
    </LayeredCard>)}
    {data.hasMore && <ActionButton label="Load more reports" loading={loading} disabled={loading} onPress={() => load(data.page + 1)} />}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  denied: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 16 },
  heading: { gap: 4 }, title: { ...TYPOGRAPHY.title2, color: COLORS.primary },
  body: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, lineHeight: 23 },
  caption: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, lineHeight: 20 },
  name: { ...TYPOGRAPHY.h3, color: COLORS.text }, issue: { ...TYPOGRAPHY.buttonCaption, color: COLORS.primary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  selectedFilter: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { ...TYPOGRAPHY.buttonSmall, color: COLORS.primary }, selectedFilterText: { color: COLORS.surface },
  stats: { padding: 16, flexDirection: 'row', gap: 12 }, stat: { flex: 1, minWidth: 0, gap: 4 },
  number: { ...TYPOGRAPHY.h1, color: COLORS.primary }, card: { padding: 18, gap: 8 },
  report: { flexDirection: 'row', alignItems: 'center', gap: 12 }, reportCopy: { flex: 1, minWidth: 0, gap: 6 },
  status: { ...TYPOGRAPHY.buttonSmall, color: COLORS.primary }, appeal: { color: COLORS.warning },
  errorCard: { padding: 16, gap: 12, backgroundColor: COLORS.dangerMuted }, error: { ...TYPOGRAPHY.subheadline, color: COLORS.danger },
});
