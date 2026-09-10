import { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';
export default function ExchangeEndorsement({ transaction, onSaved }) {
  const [choice, setChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showError } = useError();
  const state = transaction.endorsement;
  if (!state?.canRate && !state?.submitted) return null;
  const send = async () => {
    if (saving || choice === null) return;
    setSaving(true);
    try { await api.endorseTransaction(transaction.id, choice); await onSaved(); }
    catch (error) { showError({ message:error.message || 'Could not save your feedback. Try again.' }); }
    finally { setSaving(false); }
  };
  return <View style={{ padding:SPACING.lg,marginTop:SPACING.lg,borderWidth:1,borderColor:COLORS.borderGreen,borderRadius:RADIUS.lg,backgroundColor:COLORS.surface,gap:12 }}>
    <Text style={{ ...TYPOGRAPHY.headline,color:COLORS.primary }}>{state.submitted ? 'Thanks for your feedback' : 'How was the exchange?'}</Text>
    {state.submitted ? <Text style={{ color:COLORS.textSecondary }}>Your {state.positive ? 'thumbs up' : 'thumbs down'} is saved.</Text> : <>
      <View style={{ flexDirection:'row',gap:12 }}>
        {[true,false].map(positive => <HapticPressable key={String(positive)} accessibilityRole="button" accessibilityLabel={positive ? 'Thumbs up' : 'Thumbs down'}
          accessibilityState={{ selected:choice === positive,disabled:saving }} disabled={saving} onPress={() => setChoice(positive)}
          style={{ flex:1,minHeight:88,gap:6,padding:12,alignItems:'center',justifyContent:'center',borderWidth:choice===positive ? 2 : 1,borderColor:choice===positive ? COLORS.primary : COLORS.borderBrown,borderRadius:RADIUS.md,backgroundColor:choice===positive ? COLORS.primaryMuted : COLORS.surface }}>
          <Ionicons name={positive ? 'thumbs-up-outline' : 'thumbs-down-outline'} size={36} illustrated selected={choice===positive} color={COLORS.primary} />
          <Text style={{ ...TYPOGRAPHY.footnote,color:COLORS.primary,fontWeight:choice===positive ? '700' : '500' }}>{positive ? 'Thumbs up' : 'Thumbs down'}</Text>
        </HapticPressable>)}
      </View>
      <HapticPressable accessibilityRole="button" accessibilityLabel="Send endorsement" disabled={saving || choice===null} onPress={send}
        style={{ minHeight:48,borderRadius:RADIUS.md,backgroundColor:COLORS.primary,opacity:choice===null ? 0.5 : 1,alignItems:'center',justifyContent:'center' }}>
        {saving ? <ActivityIndicator color={COLORS.surface} /> : <Text style={{ color:COLORS.surface,fontWeight:'700' }}>Send feedback</Text>}
      </HapticPressable>
    </>}
    <Text style={{ ...TYPOGRAPHY.caption1,color:COLORS.textSecondary }}>Feedback counts after both people respond or 14 days pass. Sent feedback can’t be changed.</Text>
  </View>;
}
