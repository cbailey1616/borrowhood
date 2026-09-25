import { useState, useEffect } from 'react';
import { ScrollView, View, Text, ActivityIndicator, RefreshControl } from 'react-native';
import api from '../services/api';
import ActionButton from '../components/ActionButton';
import LayeredCard from '../components/LayeredCard';
import { COLORS, TYPOGRAPHY } from '../utils/config';

export default function InsightsScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setData(await api.getFunnelInsights(30)); }
    catch { setError('Insights could not be loaded. Administrator access is required.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const rows = data ? [['New accounts', data.signups], ['Finished onboarding', data.onboarded], ['Members who listed an item', data.first_listers], ['Members who requested an item', data.first_requesters], ['Borrow requests', data.requests], ['Accepted requests', data.accepted], ['Returns / giveaway handoffs', data.returned], ['Onboarding completion', data.onboardingRate == null ? '—' : `${data.onboardingRate}%`], ['Request acceptance', data.acceptanceRate == null ? '—' : `${data.acceptanceRate}%`]] : [];
  return <ScrollView style={{ flex: 1, backgroundColor: COLORS.background }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 50 }} refreshControl={<RefreshControl tintColor={COLORS.spinner} colors={[COLORS.spinner]} refreshing={loading} onRefresh={load} />}>
    <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '400' }}>Last 30 days</Text>
    <Text style={{ color: COLORS.textSecondary, fontSize: 15, lineHeight: 22 }}>Member activity and exchange completion. Aggregate counts only.</Text>
    {loading && !data && <ActivityIndicator color={COLORS.spinner} />}
    {!!error && <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={{ ...TYPOGRAPHY.bodySmall, color: COLORS.danger }}>{error}</Text>
      <ActionButton label="Try again" icon="refresh-outline" loading={loading} onPress={load} />
    </View>}
    {rows.map(([label, value]) => <LayeredCard key={label} style={{ padding: 18, gap: 8 }}>
      <Text style={{ ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary }}>{label}</Text><Text style={{ ...TYPOGRAPHY.h1, color: COLORS.primary }}>{value}</Text>
    </LayeredCard>)}
    {data && <Text style={{ fontSize: 13, lineHeight: 20, color: COLORS.textSecondary }}>{data.note}</Text>}
  </ScrollView>;
}
