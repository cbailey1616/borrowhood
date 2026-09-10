import { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';
export default function ExchangeEndorsement({ transaction, onSaved }) {
  const [choice, setChoice] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const { showError } = useError();
  const state = transaction.endorsement;
  if (!state?.canRate && !state?.submitted) return null;
  const send = async () => {
    if (saving || choice === undefined) return;
    setSaving(true);
    try { await api.endorseTransaction(transaction.id, choice); await onSaved(); }
    catch (error) { showError({ message:error.message || 'Could not save your feedback. Try again.' }); }
    finally { setSaving(false); }
  };
  return <View style={{ padding:SPACING.lg,marginTop:SPACING.lg,borderWidth:1,borderColor:COLORS.borderGreen,borderRadius:RADIUS.lg,backgroundColor:COLORS.surface,gap:12 }}>
    <Text style={{ ...TYPOGRAPHY.headline,color:COLORS.primary }}>{state.submitted ? 'Thanks for your feedback' : 'How was the exchange?'}</Text>
    {state.submitted ? <Text style={{ color:COLORS.textSecondary }}>Your {state.positive === null ? 'neutral feedback' : state.positive ? 'thumbs up' : 'thumbs down'} is saved.</Text> : <>
      <View style={{ flexDirection:'row',gap:12 }}>
        {[true,null,false].map(positive => <HapticPressable key={String(positive)} accessibilityRole="button" accessibilityLabel={positive === null ? 'Neutral' : positive ? 'Thumbs up' : 'Thumbs down'}
          accessibilityState={{ selected:choice === positive,disabled:saving }} disabled={saving} onPress={() => setChoice(positive)}
          style={{ flex:1,minHeight:88,gap:6,padding:12,alignItems:'center',justifyContent:'center',borderWidth:choice===positive ? 2 : 1,borderColor:choice===positive ? COLORS.primary : COLORS.borderBrown,borderRadius:RADIUS.md,backgroundColor:choice===positive ? COLORS.primaryMuted : COLORS.surface }}>
          <Ionicons name={positive === null ? 'remove-outline' : positive ? 'thumbs-up-outline' : 'thumbs-down-outline'} size={32} illustrated selected={choice===positive} color={COLORS.primary} />
          <Text style={{ ...TYPOGRAPHY.footnote,color:COLORS.primary,textAlign:'center',fontWeight:choice===positive ? '700' : '500' }}>{positive === null ? 'Neutral' : positive ? 'Thumbs up' : 'Thumbs down'}</Text>
        </HapticPressable>)}
      </View>
      <HapticPressable accessibilityRole="button" accessibilityLabel="Send endorsement" disabled={saving || choice===undefined} onPress={send}
        style={{ minHeight:48,borderRadius:RADIUS.md,backgroundColor:COLORS.primary,opacity:choice===undefined ? 0.5 : 1,alignItems:'center',justifyContent:'center' }}>
        {saving ? <ActivityIndicator color={COLORS.surface} /> : <Text style={{ color:COLORS.surface,fontWeight:'700' }}>Send feedback</Text>}
      </HapticPressable>
    </>}
    <Text style={{ ...TYPOGRAPHY.caption1,color:COLORS.textSecondary }}>Feedback updates their Neighbor Score immediately. Neutral has no effect. Sent feedback can’t be changed.</Text>
  </View>;
}
