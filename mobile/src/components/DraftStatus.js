import { Text, View } from 'react-native';
import HapticPressable from './HapticPressable';
import { COLORS } from '../utils/config';

export default function DraftStatus({ draft, allowDiscard = false }) {
  if (!draft.error && !draft.saved && !draft.restored) return null;
  return <View style={{ paddingVertical: 8 }}>
    <Text accessibilityRole={draft.error ? 'alert' : undefined} style={{ color: COLORS.textSecondary, fontSize: 13 }}>
      {draft.error ? 'Draft could not be saved on this device. Keep this form open.' : draft.saved ? 'Draft saved on this device · only you can see it' : 'Draft restored'}
    </Text>
    {draft.error && <HapticPressable onPress={draft.retry} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: COLORS.primary }}>Try saving draft again</Text></HapticPressable>}
    {allowDiscard && draft.restored && <HapticPressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => Alert.alert('Discard this draft?', 'This clears this unfinished form from your device. It does not delete anything you have posted.', [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Discard draft', style: 'destructive', onPress: () => draft.discard().catch(() => {}) },
    ])}><Text style={{ color: COLORS.textSecondary }}>Discard draft and start fresh</Text></HapticPressable>}
  </View>;
}
import { ThemedAlert as Alert } from "./ThemedAlert";
