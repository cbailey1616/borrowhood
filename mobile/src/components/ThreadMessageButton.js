import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import api from '../services/api';
import { COLORS } from '../utils/config';

export default function ThreadMessageButton({ author, currentUserId, navigation, context, isOwn }) {
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!author?.id || !currentUserId || isOwn || author.id === currentUserId) return null;
  const open = async event => {
    event?.stopPropagation?.();
    if (busy.current) return;
    busy.current = true; setLoading(true); setFailed(false);
    try {
      const conversations = await api.getConversations();
      const existing = conversations.find(chat => chat.otherUser?.id === author.id);
      navigation.navigate('Chat', {
        conversationId: existing?.id,
        recipientId: author.id,
        recipient: author,
        threadContext: context,
      });
    } catch { setFailed(true); }
    finally { busy.current = false; setLoading(false); }
  };
  return <View>
    <HapticPressable accessibilityRole="button" accessibilityLabel={`Message ${author.firstName || 'neighbor'} privately`}
      accessibilityHint="Opens private chat; does not post a reply" disabled={loading} onPress={open}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 8 }}>
      <Ionicons name="chatbubble" size={18} color={COLORS.primary} illustrated />
      <Text style={{ color: COLORS.primary, fontSize: 13 }}>{loading ? 'Opening…' : failed ? 'Try message again' : 'Message'}</Text>
    </HapticPressable>
    {failed && <Text accessibilityRole="alert" style={{ color: COLORS.textSecondary, fontSize: 12 }}>Couldn’t open chat. Please try again.</Text>}
  </View>;
}
