import React, { useState } from 'react';
import { Text } from 'react-native';
import HapticPressable from './HapticPressable';
import { ThemedAlert as Alert } from './ThemedAlert';
import { COLORS } from '../utils/config';
import api from '../services/api';
export default function UserSafetyActions({ userId }) {
  const [busy, setBusy] = useState(false);
  const run = async action => {
    try { await action(); } catch { Alert.alert('Please try again', 'We couldn’t save that change.'); }
  };
  if (!userId) return null;
  return <HapticPressable accessibilityRole="button" disabled={busy} onPress={async () => {
    setBusy(true);
    try {
      const { blocked } = await api.getUserSafety(userId);
      Alert.alert('Safety options', 'Report safety concerns here. Discuss item and payment disagreements directly with your neighbor.', [
        { text: 'Cancel', style: 'cancel' },
        { text: blocked ? 'Unblock messages' : 'Block messages', onPress: () => run(async () => {
          if (blocked) await api.unblockUser(userId); else await api.blockUser(userId);
          Alert.alert(blocked ? 'Messages unblocked' : 'Messages blocked', blocked ? 'You can message each other again.' : 'Neither of you can send new messages to the other. Existing history stays available.');
        }) },
        ...['Scam or fraud','Harassment','Unsafe behavior'].map(reason => ({ text: `Report: ${reason}`, onPress: () => run(async () => {
          await api.reportUser(userId, reason); Alert.alert('Report received', 'Your report has been recorded.');
        }) })),
      ]);
    } catch { Alert.alert('Please try again', 'We couldn’t load these options.'); }
    finally { setBusy(false); }
  }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}><Text style={{ color: COLORS.primary }}>Report or block</Text></HapticPressable>;
}
