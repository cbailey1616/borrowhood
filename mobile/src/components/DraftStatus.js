import { Text, View } from 'react-native';
import ActionButton from './ActionButton';
import { COLORS } from '../utils/config';

export default function DraftStatus({ draft, allowDiscard = false, quiet = false }) {
  if (quiet && !draft.error && !(allowDiscard && draft.restored)) return null;
  if (!draft.error && !draft.saved && !draft.restored) return null;
  return <View style={{ paddingVertical: 8, gap: 8 }}>
    {(!quiet || draft.error) && <Text accessibilityRole={draft.error ? 'alert' : undefined} style={{ color: COLORS.textSecondary, fontSize: 13 }}>
      {draft.error ? 'Draft could not be saved on this device. Keep this form open.' : draft.saved ? 'Draft saved on this device · only you can see it' : 'Draft restored'}
    </Text>}
    {draft.error && <ActionButton onPress={draft.retry} label="Try saving draft again" />}
    {allowDiscard && draft.restored && <ActionButton destructive label="Discard draft and start fresh" onPress={() => Alert.alert('Discard this draft?', 'This clears this unfinished form from your device. It does not delete anything you have posted.', [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Discard draft', style: 'destructive', onPress: () => draft.discard().catch(() => {}) },
    ])} />}
  </View>;
}
import { ThemedAlert as Alert } from "./ThemedAlert";
