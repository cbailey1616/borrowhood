import React, { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, ScrollView, Image, StyleSheet, ActivityIndicator, AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from './HapticPressable';
import MessageComposer from './MessageComposer';
import ComposerKeyboardView from './ComposerKeyboardView';
import ActionSheet from './ActionSheet';
import { ThemedAlert as Alert } from './ThemedAlert';
import { Ionicons } from './Icon';

// The neighborhood page and Inbox both mount this same channel by community ID.
export default function CommunityChat({ community, navigation, header }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [nextBefore, setNextBefore] = useState(null);
  const [muted, setMuted] = useState(false);
  const [role, setRole] = useState(community.role);
  const [menu, setMenu] = useState(null);
  const alive = useRef(false);
  const generation = useRef(0);
  const sendLock = useRef(false);
  const retry = useRef(null);
  const list = useRef(null);
  const nearBottom = useRef(true);
  const requestNumber = useRef(0);
  const draft = useRef(new Map());
  const id = community.id;

  const refresh = useCallback(async (before) => {
    const token = generation.current;
    const request = ++requestNumber.current;
    try {
      const result = await api.getCommunityChat(id, { ...(thread ? { parentId: thread.id } : {}), ...(before ? { before } : {}) });
      if (!alive.current || token !== generation.current || request !== requestNumber.current) return;
      setMessages(old => {
        const merged = new Map((before ? old : []).map(m => [m.id, m]));
        result.messages.forEach(m => merged.set(m.id, m));
        return [...merged.values()].sort((a, b) => Number(b.sequence) - Number(a.sequence));
      });
      setNextBefore(result.nextBefore); setMuted(result.muted); setRole(result.role); setError('');
      if (!before && nearBottom.current) await api.markCommunityChatRead(id, result.readSequence);
    } catch (err) {
      if (alive.current && token === generation.current) {
        setError(err.message || 'Could not load chat. Tap to retry.');
        if (err.status === 403) setMessages([]);
      }
    } finally { if (alive.current && token === generation.current) setLoading(false); }
  }, [id, thread?.id]);

  useFocusEffect(useCallback(() => {
    alive.current = true; generation.current += 1;
    setMessages([]); setLoading(true); nearBottom.current = true;
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && nearBottom.current) refresh();
    }, 8000);
    return () => { alive.current = false; generation.current += 1; clearInterval(timer); };
  }, [refresh, user?.id]));

  const changeThread = next => {
    draft.current.set(thread?.id || 'main', text);
    setText(draft.current.get(next?.id || 'main') || '');
    setThread(next); retry.current = null;
  };
  const send = async () => {
    if (!text.trim() || sendLock.current) return;
    sendLock.current = true; setSending(true);
    const content = text.trim();
    const key = `${id}:${thread?.id || ''}:${content}`;
    const token = generation.current;
    if (retry.current?.key !== key) retry.current = { key, clientRequestId: Crypto.randomUUID() };
    try {
      await api.sendCommunityMessage(id, { content, parentId: thread?.id || null, clientRequestId: retry.current.clientRequestId });
      if (!alive.current || token !== generation.current) return;
      setText(''); retry.current = null; nearBottom.current = true;
      await refresh(); list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (err) { if (alive.current && token === generation.current) setError(err.message || 'Message not sent. Try again.'); }
    finally { sendLock.current = false; if (alive.current) setSending(false); }
  };
  const remove = message => Alert.alert('Remove message?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await api.deleteCommunityMessage(id, message.id); await refresh(); }
      catch (err) { setError(err.message || 'Could not remove message.'); }
    } },
  ]);
  const toggleMute = async () => {
    try { const result = await api.setCommunityChatMuted(id, !muted); setMuted(result.muted); }
    catch (err) { setError(err.message || 'Could not update mute setting.'); }
  };
  const options = menu === 'channel' ? [
    { label: muted ? 'Unmute chat' : 'Mute chat', onPress: toggleMute },
    { label: 'Neighborhood settings', onPress: () => navigation.navigate('CommunitySettings', { id }) },
  ] : menu ? [
    ...(!menu.deleted ? [{ label: 'Reply', onPress: () => changeThread(menu.parentId ? thread : menu) }] : []),
    ...(role === 'organizer' || menu.sender.id === user?.id ? [{ label: 'Remove message', destructive: true, onPress: () => remove(menu) }] : []),
  ] : [];

  return <ComposerKeyboardView style={styles.container}>
    {header}
    <View style={styles.chatHeading}>
      {thread ? <HapticPressable onPress={() => changeThread(null)} accessibilityLabel="Back to neighborhood chat" style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={COLORS.primary} /><Text style={styles.heading}>Replies</Text>
      </HapticPressable> : <Text style={styles.heading}>Chat{muted ? ' · Muted' : ''}</Text>}
      <HapticPressable onPress={() => setMenu('channel')} accessibilityLabel="Chat options" style={styles.more}>
        <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.primary} />
      </HapticPressable>
    </View>
    {!!error && <HapticPressable onPress={() => refresh()} style={styles.error}><Text style={styles.errorText}>{error}</Text></HapticPressable>}
    {loading ? <ActivityIndicator style={styles.conversation} color={COLORS.primary} /> : !messages.length ? <ScrollView
      style={styles.conversation} contentContainerStyle={styles.emptyConversation} keyboardShouldPersistTaps="handled">
      {!error && <View style={styles.welcome}>
        <View style={styles.welcomeIcon}><Ionicons name="chatbubble-ellipses" size={32} illustrated color={COLORS.primary} /></View>
        <Text style={styles.empty}>{thread ? 'No replies yet.' : 'Say hello to your neighbors.'}</Text>
      </View>}
    </ScrollView> : <FlatList
      ref={list} style={styles.conversation} inverted data={messages} keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages}
      onScroll={event => { nearBottom.current = event.nativeEvent.contentOffset.y < 80; }} scrollEventThrottle={100}
      ListFooterComponent={nextBefore ? <HapticPressable onPress={() => refresh(nextBefore)} style={styles.more}><Text style={styles.link}>Earlier messages</Text></HapticPressable> : null}
      renderItem={({ item }) => <View style={[styles.message, item.sender.id === user?.id && styles.own]}>
        <HapticPressable onPress={() => navigation.navigate('UserProfile', { id: item.sender.id })} accessibilityLabel={`View ${item.sender.name}'s profile`}>
          {item.sender.photoUrl ? <Image source={{ uri: item.sender.photoUrl }} style={styles.avatar} /> : <View style={styles.avatar}><Ionicons name="person" size={22} color={COLORS.primary} /></View>}
        </HapticPressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.messageHeader}><HapticPressable onPress={() => navigation.navigate('UserProfile', { id: item.sender.id })}><Text style={styles.name}>{item.sender.name}</Text></HapticPressable>
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View>
          <HapticPressable onLongPress={() => setMenu(item)} accessibilityLabel={item.content}><Text style={styles.body}>{item.content}</Text></HapticPressable>
          {!thread && (!item.deleted || item.replyCount > 0) && <HapticPressable onPress={() => changeThread(item)} style={styles.reply} accessibilityLabel={`Reply to ${item.sender.name}`}>
            <Text style={styles.link}>{item.replyCount ? `${item.replyCount} ${item.replyCount === 1 ? 'reply' : 'replies'}` : 'Reply'}</Text>
          </HapticPressable>}
          {(role === 'organizer' || item.sender.id === user?.id) && !item.deleted && <HapticPressable onPress={() => setMenu(item)} accessibilityLabel="Message options" style={styles.messageOptions}><Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} /></HapticPressable>}
        </View>
      </View>}
    />}
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}><MessageComposer value={text} onChangeText={setText} onSend={send}
      placeholder={thread ? 'Write a reply…' : 'Message your neighbors…'} disabled={!text.trim() || loading} editable={!sending} loading={sending} /></View>
    <ActionSheet isVisible={!!menu} onClose={() => setMenu(null)} actions={options} />
  </ComposerKeyboardView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  chatHeading: { paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { ...TYPOGRAPHY.headline, color: COLORS.primary }, back: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  more: { padding: 12, alignItems: 'center' }, messages: { padding: SPACING.md, gap: 10 },
  conversation: { flex: 1 },
  emptyConversation: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.lg },
  welcome: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  welcomeIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  message: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14 },
  own: { backgroundColor: COLORS.primaryMuted }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  messageHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, name: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  time: { ...TYPOGRAPHY.caption1, color: COLORS.textMuted }, body: { ...TYPOGRAPHY.body, color: COLORS.text, marginTop: 5 },
  reply: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }, link: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  messageOptions: { position: 'absolute', bottom: -4, right: 0, padding: 10 },
  dock: { paddingHorizontal: SPACING.md, paddingTop: 8 }, empty: { ...TYPOGRAPHY.body, textAlign: 'center', color: COLORS.text },
  error: { padding: 12 }, errorText: { ...TYPOGRAPHY.footnote, color: COLORS.danger },
});
