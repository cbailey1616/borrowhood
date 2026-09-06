import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Keyboard, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import HapticPressable from '../../components/HapticPressable';
import HeroIcon from '../../components/HeroIcon';
import { Ionicons } from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { COLORS, RADIUS } from '../../utils/config';
import { US_STATES, normalizeUSState, stateName } from '../../utils/usStates';

export default function OnboardingTownScreen() {
  const { user, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [city, setCity] = useState(user?.city || '');
  const [state, setState] = useState(normalizeUSState(user?.state));
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const needsName = !user?.firstName?.trim();
  const [firstName, setFirstName] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const locate = async () => {
    Keyboard.dismiss(); setStatePickerOpen(false);
    setLocating(true); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Enter your town below to continue without location access.');
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync(coords);
      const town = address?.city;
      const stateCode = normalizeUSState(address?.region);
      if (!town || !stateCode) throw new Error('Could not identify your town. Please enter it below.');
      setCity(town); setState(stateCode);
    } catch (e) { setError(e.message || 'Could not find your town. You can enter it below.'); }
    finally { setLocating(false); }
  };
  const finish = async () => {
    if (busy || locating) return;
    if (needsName && !firstName.trim()) { setError('What should we call you? Add your first name.'); return; }
    if (!city.trim() || !state.trim()) { setError('Enter your town and state to continue.'); return; }
    setBusy(true); setError('');
    try {
      // Store town only: precise device coordinates stay on the device.
      await api.updateProfile({ city: city.trim(), state: state.trim(), ...(needsName ? { firstName: firstName.trim() } : {}) });
      await api.completeOnboarding();
      await refreshUser();
    } catch { setError('Could not finish setup. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <HeroIcon icon="location-outline" size={72} />
        <Text style={styles.title}>What’s your town?</Text>
        <Text style={styles.body}>Find people nearby. Your street address stays private.</Text>
        {needsName && <>
          <Text style={styles.label}>Your first name</Text>
          <TextInput accessibilityLabel="Your first name" value={firstName} onChangeText={setFirstName} editable={!busy} autoCapitalize="words" autoCorrect={false} textContentType="givenName" maxLength={100} style={styles.input} placeholder="What should we call you?" placeholderTextColor={COLORS.textMuted} />
        </>}
        <HapticPressable accessibilityRole="button" disabled={locating || busy} onPress={locate} style={styles.secondary}>
          {locating ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.link}>Use my current location</Text>}
        </HapticPressable>
        <Text style={styles.label}>Town or city</Text>
        <TextInput accessibilityLabel="Town or city" value={city} onChangeText={setCity} editable={!busy && !locating} autoCapitalize="words" autoCorrect={false} maxLength={100} style={styles.input} placeholder="Enter your town" placeholderTextColor={COLORS.textMuted} />
        <Text style={styles.label}>State</Text>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Choose state" accessibilityValue={{ text: stateName(state) || 'No state selected' }} accessibilityState={{ expanded: statePickerOpen, disabled: busy || locating }} disabled={busy || locating} style={[styles.input, styles.stateField]} onPress={() => { Keyboard.dismiss(); setStatePickerOpen(open => !open); }}>
          <Text style={[styles.stateText, !state && { color: COLORS.textMuted }]}>{stateName(state) || 'Choose state'}</Text>
          <Ionicons name={statePickerOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.primary} />
        </HapticPressable>
        {statePickerOpen && <View style={styles.pickerCard}>
          <Picker accessibilityLabel="State" testID="Onboarding.statePicker" selectedValue={state} onValueChange={setState} enabled={!busy && !locating} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor={COLORS.primary}>
            <Picker.Item label="Choose state" value="" color={COLORS.textSecondary} />
            {US_STATES.map(([code, name]) => <Picker.Item key={code} label={name} value={code} color={COLORS.text} />)}
          </Picker>
          <HapticPressable accessibilityRole="button" style={styles.pickerDone} onPress={() => setStatePickerOpen(false)}>
            <Text style={styles.link}>Done</Text>
          </HapticPressable>
        </View>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <HapticPressable accessibilityRole="button" disabled={busy || locating} onPress={finish} style={styles.button}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Continue to Borrowhood</Text>}
        </HapticPressable>
        <Text style={styles.note}>Verify later to share and ask across your town.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 24, gap: 14 },
  title: { fontSize: 30, fontWeight: '700', color: COLORS.text },
  body: { fontSize: 16, lineHeight: 24, color: COLORS.textSecondary },
  label: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  input: { minHeight: 52, fontSize: 17, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text },
  stateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stateText: { flex: 1, fontSize: 17, color: COLORS.text },
  pickerCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + '80', overflow: 'hidden' },
  picker: { color: COLORS.text, backgroundColor: COLORS.surface },
  pickerItem: { color: COLORS.text, fontSize: 20 },
  pickerDone: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border },
  secondary: { minHeight: 48, justifyContent: 'center', paddingVertical: 12 },
  link: { color: COLORS.primary, fontSize: 16, fontWeight: '600' },
  button: { minHeight: 52, padding: 16, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontSize: 17, fontWeight: '600' },
  note: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  error: { color: COLORS.danger, fontSize: 15 },
});
