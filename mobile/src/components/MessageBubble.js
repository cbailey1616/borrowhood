import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import HapticPressable from './HapticPressable';
import ShimmerImage from './ShimmerImage';
import MessageReactions from './MessageReactions';
import { Ionicons } from './Icon';
import useReduceMotion from '../hooks/useReduceMotion';
import { CARD_SURFACE, COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

// Direct messages and neighborhood replies use the same alignment and controls.
// Content, attachments, and all network actions remain owned by their screen.
const MessageBubble = forwardRef(function MessageBubble({
  children, own = false, startsGroup = true, senderName, showSender = false,
  avatarUrl, onProfile, profileAccessibilityLabel, avatarTestID, time,
  deleted = false, onLongPress, reactions = [], userId, onToggleReaction,
  onAddReaction, onReply, replyLabel, replyAccessibilityLabel, replyDisabled,
  unreadReplyCount, onOptions, testID,
}, ref) {
  const reduceMotion = useReduceMotion();
  const initials = (senderName || 'Neighbor').trim().split(/\s+/)
    .slice(0, 2).map(part => part[0]).join('').toUpperCase();

  return <Animated.View ref={ref} testID={testID} collapsable={false}
    entering={reduceMotion ? undefined : FadeInUp.duration(160)}
    style={[styles.row, own ? styles.outgoing : styles.incoming, startsGroup && styles.groupStart]}>
    {!own && <View style={styles.avatarSlot}>
      {startsGroup && <HapticPressable haptic={null} scaleDown={1} onPress={onProfile} disabled={!onProfile}
        style={styles.avatarButton} accessibilityLabel={profileAccessibilityLabel || `View ${senderName}’s profile`} testID={avatarTestID}>
        <ShimmerImage source={{ uri: avatarUrl || null }} placeholderIcon="person" style={styles.avatar}
          placeholder={<View style={[styles.avatar, styles.initialsAvatar]}><Text maxFontSizeMultiplier={1.4} style={styles.initials}>{initials}</Text></View>} />
      </HapticPressable>}
    </View>}
    <View style={[styles.column, own ? styles.outgoingColumn : styles.incomingColumn]}>
      {showSender && startsGroup && !own && <Text maxFontSizeMultiplier={1.4} style={styles.sender}>{senderName}</Text>}
      <HapticPressable haptic={null} scaleDown={1} longPressHaptic="selection" accessible={false}
        onLongPress={deleted ? undefined : onLongPress}
        style={[styles.bubble, own ? styles.ownBubble : styles.otherBubble, deleted && styles.deletedBubble]}>
        {children}
      </HapticPressable>
      {!!reactions.length && !deleted && <View style={styles.reactions}>
        <MessageReactions reactions={reactions} userId={userId} onToggle={onToggleReaction} inline compact />
      </View>}
      <View style={[styles.footer, own && styles.outgoingFooter]}>
        <Text maxFontSizeMultiplier={1.4} style={styles.time}>{time}</Text>
        {!!onReply && <HapticPressable haptic={null} scaleDown={1} disabled={replyDisabled} onPress={onReply}
          accessibilityLabel={replyAccessibilityLabel} style={styles.reply}>
          <Ionicons name="chat-reply" size={16} color={COLORS.primary} illustrated={false} selected={false} />
          <Text maxFontSizeMultiplier={1.4} style={styles.replyText}>{replyLabel || 'Reply'}</Text>
          {!!unreadReplyCount && <Text maxFontSizeMultiplier={1.4} style={styles.unread}>{unreadReplyCount} new</Text>}
        </HapticPressable>}
        {!deleted && !!onAddReaction && <HapticPressable haptic={null} scaleDown={1} onPress={onAddReaction}
          accessibilityLabel="Add reaction" style={styles.action} hitSlop={4}>
          <Ionicons name="happy-outline" size={22} color={COLORS.primary} illustrated={false} selected={false} />
        </HapticPressable>}
        {!deleted && !!onOptions && <HapticPressable haptic={null} scaleDown={1} onPress={onOptions}
          accessibilityLabel="Message options" style={styles.action} hitSlop={4}>
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textSecondary} illustrated={false} selected={false} />
        </HapticPressable>}
      </View>
    </View>
  </Animated.View>;
});

export default MessageBubble;

export function ChatDateDivider({ label }) {
  return <View style={styles.dateDivider}><Text maxFontSizeMultiplier={1.4} style={styles.date}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, marginBottom: SPACING.xs },
  incoming: { justifyContent: 'flex-start' }, outgoing: { justifyContent: 'flex-end' },
  groupStart: { marginTop: SPACING.sm },
  // The column includes the bubble and its footer; neither spans the screen.
  column: { maxWidth: '82%', flexShrink: 1, minWidth: 0 },
  incomingColumn: { alignItems: 'flex-start' }, outgoingColumn: { alignItems: 'flex-end' },
  avatarSlot: { width: 32, alignItems: 'center' },
  avatarButton: { width: 32, minHeight: 44, alignItems: 'center', paddingTop: 4 },
  avatar: { width: 28, height: 28, borderRadius: RADIUS.full },
  initialsAvatar: { backgroundColor: COLORS.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  initials: { ...TYPOGRAPHY.caption2, fontFamily: 'DMSans_500Medium', fontWeight: '500', color: COLORS.primaryDark },
  sender: { ...TYPOGRAPHY.buttonCaption, color: COLORS.primary, marginLeft: SPACING.sm, marginBottom: SPACING.xs },
  bubble: { ...CARD_SURFACE, maxWidth: '100%', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg },
  ownBubble: { backgroundColor: COLORS.chatOwn, borderBottomRightRadius: SPACING.xs },
  otherBubble: { backgroundColor: COLORS.surface, borderBottomLeftRadius: SPACING.xs },
  deletedBubble: { backgroundColor: COLORS.surfaceElevated, borderStyle: 'dashed' },
  reactions: { maxWidth: '100%', marginTop: SPACING.xs },
  footer: { maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.xs },
  outgoingFooter: { justifyContent: 'flex-end' },
  time: { ...TYPOGRAPHY.caption2, color: COLORS.textSecondary, flexShrink: 1, paddingVertical: SPACING.xs },
  action: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full },
  reply: { minHeight: 36, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.xs, borderRadius: RADIUS.full },
  replyText: { ...TYPOGRAPHY.buttonCaption, color: COLORS.primary },
  unread: { ...TYPOGRAPHY.caption2, color: COLORS.primaryDark },
  dateDivider: { alignItems: 'center', paddingVertical: SPACING.md },
  date: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
});
