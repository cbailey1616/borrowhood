import { useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';
export default function ExchangeEndorsement({ transaction, onSaved, embedded = false }) {
  const [selection, setSelection] = useState(null);
  const [sent, setSent] = useState(null);
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);
  const { width, fontScale } = useWindowDimensions();
  const stackChoices = width / fontScale < 360;
  const { showError } = useError();
  const state = transaction.endorsement;
  const choice = selection?.id === transaction.id ? selection.positive : undefined;
  const submitted = state?.submitted || sent?.id === transaction.id;
  const savedChoice = state?.submitted ? state.positive : sent?.positive;
  if (!state?.canRate && !submitted) return null;
  const send = async () => {
    if (sending.current || submitted || !state?.canRate || choice === undefined) return;
    sending.current = true;
    setSaving(true);
    try {
      await api.endorseTransaction(transaction.id, choice);
      setSent({ id: transaction.id, positive: choice });
    } catch (error) {
      showError({ message:error.message || 'Could not send your endorsement. Try again.' });
      return;
    } finally { sending.current = false; setSaving(false); }
    // A delayed refresh must not offer a second vote after the server saved it.
    try { await onSaved?.(); } catch { /* The saved endorsement remains visible. */ }
  };
  return <View style={[styles.card, embedded && styles.embedded]}>
    <Text accessibilityRole="header" style={styles.title}>{submitted ? 'Endorsement sent' : 'Leave an endorsement'}</Text>
    {submitted ? <View style={styles.savedVote}>
      <Ionicons name={savedChoice === null ? 'remove-outline' : savedChoice ? 'thumbs-up-outline' : 'thumbs-down-outline'} size={24} illustrated color={COLORS.primary} />
      <Text style={styles.savedLabel}>{savedChoice === null ? 'Neutral' : savedChoice ? 'Thumbs up' : 'Thumbs down'}</Text>
    </View> : <>
      <View style={{ flexDirection:stackChoices ? 'column' : 'row',gap:12 }}>
        {[true,null,false].map(positive => <HapticPressable key={String(positive)} accessibilityRole="button" accessibilityLabel={positive === null ? 'Neutral' : positive ? 'Thumbs up' : 'Thumbs down'}
          accessibilityState={{ selected:choice === positive,disabled:saving }} disabled={saving} onPress={() => setSelection({ id: transaction.id, positive })}
          style={{ flexGrow:1,flexShrink:1,flexBasis:stackChoices ? 'auto' : 0,flexDirection:stackChoices ? 'row' : 'column',minHeight:stackChoices ? 56 : 88,gap:stackChoices ? 12 : 6,padding:12,alignItems:'center',justifyContent:stackChoices ? 'flex-start' : 'center',borderWidth:choice===positive ? 2 : 1,borderColor:choice===positive ? COLORS.primary : COLORS.borderBrown,borderRadius:RADIUS.md,backgroundColor:choice===positive ? COLORS.primaryMuted : COLORS.surface }}>
          <Ionicons name={positive === null ? 'remove-outline' : positive ? 'thumbs-up-outline' : 'thumbs-down-outline'} size={32} illustrated selected={choice===positive} color={COLORS.primary} />
          <Text style={{ ...TYPOGRAPHY.footnote,color:COLORS.primary,textAlign:stackChoices ? 'left' : 'center',flexShrink:1,fontWeight:choice===positive ? '700' : '500' }}>{positive === null ? 'Neutral' : positive ? 'Thumbs up' : 'Thumbs down'}</Text>
        </HapticPressable>)}
      </View>
      <HapticPressable accessibilityRole="button" accessibilityLabel="Send endorsement" disabled={saving || choice===undefined} onPress={send}
        accessibilityState={{ disabled:saving || choice===undefined,busy:saving }}
        style={{ minHeight:48,padding:SPACING.sm,borderRadius:RADIUS.md,backgroundColor:COLORS.primary,opacity:choice===undefined ? 0.5 : 1,alignItems:'center',justifyContent:'center' }}>
        {saving ? <ActivityIndicator color={COLORS.surface} /> : <Text style={{ ...TYPOGRAPHY.button,color:COLORS.surface,textAlign:'center' }}>Send endorsement</Text>}
      </HapticPressable>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding:SPACING.lg,marginTop:SPACING.lg,borderWidth:1,borderColor:COLORS.borderGreen,borderRadius:RADIUS.lg,backgroundColor:COLORS.surface,gap:SPACING.md },
  embedded: { padding:0,marginTop:0,borderWidth:0,backgroundColor:'transparent' },
  title: { ...TYPOGRAPHY.h2,color:COLORS.primary,lineHeight:28 },
  savedVote: { flexDirection:'row',alignItems:'center',gap:SPACING.sm },
  savedLabel: { ...TYPOGRAPHY.body,color:COLORS.primary,flexShrink:1 },
});
