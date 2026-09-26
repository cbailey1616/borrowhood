import TextInput from '../../components/AppTextInput';
import { useRef, useState } from 'react';
import { View, Text, Keyboard, ActivityIndicator, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as Location from 'expo-location';
import HapticPressable from '../../components/HapticPressable';
import OnboardingLayout from '../../components/OnboardingLayout';
import LayeredCard from '../../components/LayeredCard';
import { Ionicons } from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import useNavigationTask from '../../hooks/useNavigationTask';
import api from '../../services/api';
import { COLORS, RADIUS, TYPOGRAPHY } from '../../utils/config';
import { US_STATES, normalizeUSState, stateName } from '../../utils/usStates';

export default function OnboardingTownScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const startTask = useNavigationTask(navigation, user?.id);
  const action = useRef(null);
  const locked = user?.isVerified === true;
  const [city, setCity] = useState(user?.city || '');
  const [state, setState] = useState(normalizeUSState(user?.state));
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const locate = async () => {
    if (action.current || locked) return;
    const isCurrent = startTask();
    action.current = 'location';
    Keyboard.dismiss(); setStatePickerOpen(false);
    setLocating(true); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!isCurrent()) return;
      if (permission.status !== 'granted') throw new Error('Enter your town below to continue without location access.');
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!isCurrent()) return;
      const [address] = await Location.reverseGeocodeAsync(coords);
      if (!isCurrent()) return;
      const town = address?.city;
      const stateCode = normalizeUSState(address?.region);
      if (!town || !stateCode) throw new Error('Could not identify your town. Please enter it below.');
      setCity(town); setState(stateCode);
    } catch (e) { if (isCurrent()) setError(e.message || 'Could not find your town. You can enter it below.'); }
    finally { action.current = null; if (isCurrent()) setLocating(false); }
  };
  const finish = async () => {
    if (action.current) return;
    if (!locked && !firstName.trim()) { setError('What should we call you? Add your first name.'); return; }
    if (!locked && (!city.trim() || !state.trim())) { setError('Enter your town and state to continue.'); return; }
    const isCurrent = startTask();
    action.current = 'save';
    setBusy(true); setError('');
    try {
      // Store town only: precise device coordinates stay on the device.
      if (!locked) await api.updateProfile({ city: city.trim(), state: state.trim(), firstName: firstName.trim() });
      if (!isCurrent()) return;
      await api.updateOnboardingStep(2);
      if (!isCurrent()) return;
      await refreshUser();
      if (isCurrent()) navigation.navigate('OnboardingNeighborhood');
    } catch { if (isCurrent()) setError('Could not save your details. Check your connection and try again.'); }
    finally { action.current = null; if (isCurrent()) setBusy(false); }
  };
  return (
    <OnboardingLayout step={1} compact keyboardAvoiding scene="onboardingTown" tone={COLORS.accentMuted}
      title={'Let’s find\nyour town.'} description="See what’s being shared near you."
      buttonLabel="Continue" onContinue={finish} busy={busy} disabled={locating} error={error}>
      <LayeredCard style={styles.card} radius={RADIUS.xl}>
        <View style={styles.field}>
          <Text style={styles.label}>Your first name</Text>
          <TextInput accessibilityLabel="Your first name" value={firstName} onChangeText={setFirstName}
            editable={!locked && !busy && !locating} autoCapitalize="words" autoCorrect={false} textContentType="givenName"
            maxLength={100} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
            style={[styles.input, focusedField === 'name' && styles.focusedInput]}
            placeholder="What should we call you?" placeholderTextColor={COLORS.textMuted} />
        </View>
        {!locked && <HapticPressable accessibilityRole="button" accessibilityLabel="Use my current location"
          accessibilityState={{ disabled: locating || busy, busy: locating }}
          disabled={locating || busy} onPress={locate} style={styles.locationButton}>
          {locating ? <ActivityIndicator color={COLORS.spinner} /> : <Ionicons name="location" size={21} illustrated />}
          <Text style={styles.locationText}>{locating ? 'Finding your town…' : 'Use my current location'}</Text>
        </HapticPressable>}
        {!locked && <View style={styles.orRow}>
          <View style={styles.rule} /><Text style={styles.orText}>or enter it yourself</Text><View style={styles.rule} />
        </View>}
        <View style={styles.field}>
          <Text style={styles.label}>Town or city</Text>
          <TextInput accessibilityLabel="Town or city" value={city} onChangeText={setCity}
            editable={!locked && !busy && !locating} autoCapitalize="words" autoCorrect={false}
            textContentType="addressCity" maxLength={100}
            onFocus={() => setFocusedField('city')} onBlur={() => setFocusedField(null)}
            style={[styles.input, focusedField === 'city' && styles.focusedInput]}
            placeholder="Enter your town" placeholderTextColor={COLORS.textMuted} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>State</Text>
          <HapticPressable accessibilityRole="button" accessibilityLabel="Choose state"
            accessibilityValue={{ text: stateName(state) || 'No state selected' }}
            accessibilityState={{ expanded: statePickerOpen, disabled: locked || busy || locating }}
            disabled={locked || busy || locating} style={[styles.input, styles.stateField, statePickerOpen && styles.focusedInput]}
            onPress={() => { Keyboard.dismiss(); setStatePickerOpen(open => !open); }}>
            <Text style={[styles.stateText, !state && { color: COLORS.textMuted }]}>{stateName(state) || 'Choose state'}</Text>
            <Ionicons name={statePickerOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.primary} />
          </HapticPressable>
        </View>
        {statePickerOpen && <View style={styles.pickerCard}>
          <Picker accessibilityLabel="State" testID="Onboarding.statePicker" selectedValue={state} onValueChange={setState}
            enabled={!busy && !locating} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor={COLORS.primary}>
            <Picker.Item label="Choose state" value="" color={COLORS.textSecondary} />
            {US_STATES.map(([code, name]) => <Picker.Item key={code} label={name} value={code} color={COLORS.text} />)}
          </Picker>
          <HapticPressable accessibilityRole="button" style={styles.pickerDone} onPress={() => setStatePickerOpen(false)}>
            <Text style={styles.link}>Done</Text>
          </HapticPressable>
        </View>}
      </LayeredCard>
      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed-outline" size={17} color={COLORS.primary} />
        <Text style={styles.privacyText}>{locked ? 'Name and town are locked after verification.' : 'Your street address stays private.'}</Text>
      </View>
    </OnboardingLayout>
  );
}
const styles = StyleSheet.create({
  card: { padding: 18, gap: 16 },
  field: { gap: 8 },
  label: { ...TYPOGRAPHY.subheadline, color: COLORS.text },
  input: { ...TYPOGRAPHY.headline, minHeight: 52, padding: 14, backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text },
  focusedInput: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  stateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stateText: { ...TYPOGRAPHY.headline, flex: 1, color: COLORS.text },
  pickerCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, overflow: 'hidden' },
  picker: { color: COLORS.text, backgroundColor: COLORS.surface },
  pickerItem: { color: COLORS.text, fontSize: 20 },
  pickerDone: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border },
  link: { ...TYPOGRAPHY.body, color: COLORS.primary },
  locationButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 9, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryMuted },
  locationText: { ...TYPOGRAPHY.body, color: COLORS.primary, textAlign: 'center', flexShrink: 1 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: 1, backgroundColor: COLORS.borderLight },
  orText: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary, flexShrink: 1 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 8, marginTop: 16 },
  privacyText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flex: 1 },
});
