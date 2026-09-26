import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TextInput from '../../components/AppTextInput';
import HapticPressable from '../../components/HapticPressable';
import OnboardingLayout from '../../components/OnboardingLayout';
import PopupLayer from '../../components/PopupLayer';
import SheetDismissArea from '../../components/SheetDismissArea';
import { Ionicons } from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import useNavigationTask from '../../hooks/useNavigationTask';
import api from '../../services/api';
import { COLORS, RADIUS, TYPOGRAPHY } from '../../utils/config';

export default function OnboardingNeighborhoodScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const startTask = useNavigationTask(navigation, `${user?.id}:${user?.city}:${user?.state}`);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const action = useRef(false);
  const loadVersion = useRef(0);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    const isCurrent = startTask();
    const version = ++loadVersion.current;
    setLoading(true); setLoadError('');
    try {
      if (!user?.city || !user?.state) throw new Error('Go back and add your town and state first.');
      // Discovery uses the town saved in step one, never device coordinates.
      const result = await api.getCommunities();
      if (!isCurrent() || version !== loadVersion.current) return;
      if (!Array.isArray(result)) throw new Error('Could not load neighborhoods. Please try again.');
      setNeighborhoods(result);
      setSelectedId(previous => result.some(item => item.id === previous)
        ? previous : result.find(item => item.isMember)?.id || null);
    } catch (err) {
      if (isCurrent() && version === loadVersion.current) setLoadError(err.message || 'Could not load neighborhoods. Please try again.');
    } finally {
      if (isCurrent() && version === loadVersion.current) setLoading(false);
    }
  }, [startTask, user?.city, user?.state]);
  useEffect(() => {
    load();
    const unsubscribe = navigation?.addListener?.('focus', load);
    return () => unsubscribe?.();
  }, [load, navigation]);

  const advance = async isCurrent => {
    if (!isCurrent()) return;
    await api.updateOnboardingStep(3);
    if (!isCurrent()) return;
    await refreshUser();
    if (isCurrent()) navigation.navigate('OnboardingVerify');
  };
  const proceed = async (skip = false) => {
    if (action.current) return;
    const selected = neighborhoods.find(item => item.id === selectedId);
    if (!skip && !selected) return;
    const isCurrent = startTask();
    action.current = true; setBusy(true); setError('');
    try {
      if (!skip && !selected.isMember) {
        await api.joinCommunity(selected.id);
        if (!isCurrent()) return;
        // Preserve a successful join if saving progress needs a retry.
        setNeighborhoods(items => items.map(item => item.id === selected.id ? { ...item, isMember: true } : item));
      }
      await advance(isCurrent);
    } catch (err) {
      if (isCurrent()) setError(err.message || 'Could not continue. Please try again.');
    } finally {
      action.current = false;
      if (isCurrent()) setBusy(false);
    }
  };
  const openCreate = () => { setName(''); setDescription(''); setCreateError(''); setCreateOpen(true); };
  const closeCreate = () => { if (!action.current) setCreateOpen(false); };
  const create = async () => {
    if (action.current) return;
    if (name.trim().length < 3) { setCreateError('Use at least 3 characters for the neighborhood name.'); return; }
    const isCurrent = startTask();
    action.current = true; setBusy(true); setCreateError(''); setError('');
    let created = false;
    try {
      const result = await api.createCommunity({ name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
      if (!isCurrent()) return;
      if (!result?.id) throw new Error('Could not confirm the new neighborhood. Please try again.');
      // The server adds the creator as organizer. Do not send a second join.
      const neighborhood = { id: result.id, name: name.trim(), memberCount: 1, isMember: true };
      created = true;
      setNeighborhoods(items => [neighborhood, ...items]); setSelectedId(result.id);
      setSearch(''); setCreateOpen(false);
      await advance(isCurrent);
    } catch (err) {
      if (isCurrent()) (created ? setError : setCreateError)(err.message || 'Could not create the neighborhood. Please try again.');
    } finally {
      action.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const empty = !loading && !loadError && neighborhoods.length === 0;
  const selected = neighborhoods.find(item => item.id === selectedId);
  const matches = neighborhoods.filter(item => item.name?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const label = loadError ? 'Retry' : empty ? 'Create a neighborhood' : selected?.isMember ? 'Continue' : 'Join neighborhood';
  return <>
    <OnboardingLayout step={2} compact keyboardAvoiding scene="onboardingAudience" tone={COLORS.infoMuted}
      title={'Find your\nneighborhood.'} description="Share items and chat with neighbors."
      onBack={() => navigation.navigate('OnboardingTown')} busy={busy}
      buttonLabel={label} onContinue={loadError ? load : empty ? openCreate : () => proceed()}
      disabled={loading || (!loadError && !empty && !selected)} error={error}
      secondaryActions={<HapticPressable accessibilityRole="button" disabled={busy} onPress={() => proceed(true)} style={styles.linkButton}>
        <Text style={styles.link}>Not now</Text>
      </HapticPressable>}>
      <View style={styles.location}><Ionicons name="location" size={18} color={COLORS.primary} />
        <Text style={styles.locationText}>{[user?.city, user?.state].filter(Boolean).join(', ')}</Text></View>
      {loading ? <ActivityIndicator style={styles.loading} color={COLORS.spinner} accessibilityLabel="Finding neighborhoods" />
        : loadError ? <View style={styles.emptyCard}>
          <Ionicons name="refresh-outline" size={34} color={COLORS.primary} />
          <Text style={styles.emptyTitle}>Couldn’t load neighborhoods</Text>
          <Text style={styles.detail} accessibilityRole="alert">{loadError}</Text>
        </View> : empty ? <View style={styles.emptyCard}>
          <Ionicons name="home" size={48} illustrated />
          <Text style={styles.emptyTitle}>No neighborhoods nearby yet</Text>
          <Text style={styles.detail}>Start one and invite your neighbors.</Text>
        </View> : <>
          <View style={styles.search}>
            <Ionicons name="search" size={20} color={COLORS.primary} />
            <TextInput accessibilityLabel="Search neighborhoods" placeholder="Search neighborhoods" placeholderTextColor={COLORS.textMuted}
              value={search} onChangeText={setSearch} editable={!busy} style={styles.searchInput} autoCorrect={false} />
          </View>
          {!matches.length && <Text style={styles.noMatch}>No matching neighborhoods. Try another name.</Text>}
          {matches.map(item => <HapticPressable key={item.id} accessibilityRole="radio"
            accessibilityLabel={`${item.name}, ${item.memberCount || 0} neighbors${item.isMember ? ', joined' : ''}`}
            accessibilityState={{ checked: item.id === selectedId, disabled: busy }} disabled={busy}
            onPress={() => setSelectedId(item.id)} style={[styles.row, item.id === selectedId && styles.selected]}>
            <View style={styles.rowIcon}><Ionicons name="home" size={32} illustrated /></View>
            <View style={styles.rowContent}><Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.detail}>{item.memberCount || 0} neighbors{item.isMember ? ' · Joined' : ''}</Text></View>
            <Ionicons name={item.id === selectedId ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={COLORS.primary} />
          </HapticPressable>)}
          <HapticPressable accessibilityRole="button" disabled={busy} onPress={openCreate} style={styles.linkButton}>
            <Text style={styles.link}>Create a neighborhood</Text>
          </HapticPressable>
        </>}
    </OnboardingLayout>
    {createOpen && <PopupLayer visible onRequestClose={closeCreate}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} onAccessibilityEscape={closeCreate}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeCreate} accessible={false} />
        <View style={[styles.createSheet, { maxHeight: height - insets.top - 20, paddingBottom: Math.max(insets.bottom, 20) }]} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.createContent}>
            <SheetDismissArea onDismiss={closeCreate}>
              <View style={styles.sheetHeader}><Text accessibilityRole="header" style={styles.sheetTitle}>Create a neighborhood</Text>
                <HapticPressable accessibilityRole="button" accessibilityLabel="Close" disabled={busy} onPress={closeCreate} style={styles.close}>
                  <Ionicons name="close" size={22} color={COLORS.primary} /></HapticPressable></View>
            </SheetDismissArea>
            <Text style={styles.detail}>{[user?.city, user?.state].filter(Boolean).join(', ')}</Text>
            <Text style={styles.fieldLabel}>Neighborhood name</Text>
            <TextInput accessibilityLabel="Neighborhood name" value={name} onChangeText={setName} editable={!busy}
              maxLength={100} placeholder="e.g. Oak Street" placeholderTextColor={COLORS.textMuted} style={styles.input} autoCapitalize="words" />
            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput accessibilityLabel="Description (optional)" value={description} onChangeText={setDescription} editable={!busy}
              maxLength={1000} multiline style={[styles.input, styles.description]} placeholder="Tell neighbors about your area" placeholderTextColor={COLORS.textMuted} />
            {!!createError && <Text accessibilityRole="alert" style={styles.error}>{createError}</Text>}
            <HapticPressable accessibilityRole="button" accessibilityLabel="Create neighborhood" disabled={busy}
              accessibilityState={{ disabled: busy, busy }} onPress={create} style={styles.createButton}>
              {busy ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.createLabel}>Create neighborhood</Text>}
            </HapticPressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </PopupLayer>}
  </>;
}
const styles = StyleSheet.create({
  location: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 16 },
  locationText: { ...TYPOGRAPHY.subheadline, color: COLORS.text, flexShrink: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, marginBottom: 12 },
  searchInput: { ...TYPOGRAPHY.body, color: COLORS.text, flex: 1, minHeight: 50 },
  loading: { padding: 40 },
  emptyCard: { backgroundColor: COLORS.surface, padding: 24, borderRadius: RADIUS.xl, alignItems: 'center', gap: 14 },
  emptyTitle: { ...TYPOGRAPHY.title3, color: COLORS.primary, textAlign: 'center' },
  detail: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary },
  noMatch: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, paddingVertical: 24, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderLight, backgroundColor: COLORS.surface },
  selected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
  rowIcon: { width: 50, height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.accentMuted, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1, gap: 5 },
  rowTitle: { ...TYPOGRAPHY.headline, color: COLORS.primary },
  linkButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: 10 },
  link: { ...TYPOGRAPHY.body, color: COLORS.primary, textAlign: 'center', textDecorationLine: 'underline' },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  createSheet: { backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, width: '100%', maxWidth: 560, alignSelf: 'center' },
  createContent: { padding: 24, gap: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitle: { ...TYPOGRAPHY.title2, color: COLORS.primary, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { ...TYPOGRAPHY.subheadline, color: COLORS.text, marginTop: 10 },
  input: { ...TYPOGRAPHY.body, color: COLORS.text, minHeight: 52, padding: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: RADIUS.md },
  description: { minHeight: 88, textAlignVertical: 'top' },
  error: { ...TYPOGRAPHY.footnote, color: COLORS.danger },
  createButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, padding: 14, backgroundColor: COLORS.primary, marginTop: 12 },
  createLabel: { ...TYPOGRAPHY.button, color: COLORS.surface, textAlign: 'center' },
});
