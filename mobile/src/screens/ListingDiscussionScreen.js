import ShimmerImage from '../components/ShimmerImage';
import { useState, useEffect, useRef } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';

import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '../utils/config';

export default function ListingDiscussionScreen({ route, navigation }) {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const { listingId, listing, requestId, request, autoFocus } = route.params;
  const isRequest = !!requestId;
  const targetId = requestId || listingId;
  const [target, setTarget] = useState(request || listing || null);
  const targetTitle = target?.title;
  const [threadError, setThreadError] = useState('');
  const threadContext = { id: targetId, title: targetTitle, type: isRequest ? 'request' : 'listing',
    ...(isRequest ? { requestType: target?.type } : {}) };
  const isOwner = target?.isOwner;
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [actionTarget, setActionTarget] = useState(null);
  const openingChat = useRef(false);
  const [expandedPosts, setExpandedPosts] = useState({});
  const [replies, setReplies] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    let active = true;
    setTarget(request || listing || null);
    if (!request?.title && !listing?.title) {
      (isRequest ? api.getRequest(targetId) : api.getListing(targetId)).then(data => {
        if (active) setTarget(data);
      }).catch(() => { if (active) setThreadError('Couldn’t load the original post. Go back and reopen it.'); });
    }
    return () => { active = false; };
  }, [targetId]);

  useEffect(() => {
    setPosts([]); setReplies({}); setExpandedPosts({}); setReplyingTo(null); setNewComment(''); setIsLoading(true); setThreadError('');
    fetchPosts();
  }, [targetId]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, [autoFocus]);

  const fetchPosts = async () => {
    try {
      const data = isRequest
        ? await api.getRequestDiscussions(requestId, { limit: 50 })
        : await api.getDiscussions(listingId, { limit: 50 });
      setPosts(data.posts || []);
    } catch (error) {
      setThreadError('Couldn’t load comments. Go back and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchReplies = async (postId) => {
    try {
      const data = isRequest
        ? await api.getRequestDiscussionReplies(requestId, postId)
        : await api.getDiscussionReplies(listingId, postId);
      setReplies(prev => ({ ...prev, [postId]: data.replies || [] }));
    } catch (error) {
      console.error('Failed to fetch replies:', error);
    }
  };

  const toggleExpanded = async (postId) => {
    const isExpanding = !expandedPosts[postId];
    setExpandedPosts(prev => ({ ...prev, [postId]: isExpanding }));

    if (isExpanding && !replies[postId]) {
      await fetchReplies(postId);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    setThreadError('');
    try {
      const data = {
        content: newComment.trim(),
        parentId: replyingTo?.id || undefined,
      };

      const result = isRequest
        ? await api.createRequestDiscussionPost(requestId, data)
        : await api.createDiscussionPost(listingId, data);

      if (replyingTo) {
        // Add reply to the replies list
        setReplies(prev => ({
          ...prev,
          [replyingTo.id]: [...(prev[replyingTo.id] || []), {
            id: result.id,
            content: result.content,
            createdAt: result.createdAt,
            user: {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              profilePhotoUrl: user.profilePhotoUrl,
            },
            isOwn: true,
          }],
        }));

        // Update reply count on parent
        setPosts(prev => prev.map(p =>
          p.id === replyingTo.id
            ? { ...p, replyCount: (p.replyCount || 0) + 1 }
            : p
        ));

        // Expand the post to show the new reply
        setExpandedPosts(prev => ({ ...prev, [replyingTo.id]: true }));
      } else {
        // Add new top-level post
        setPosts(prev => [{
          id: result.id,
          content: result.content,
          replyCount: 0,
          createdAt: result.createdAt,
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePhotoUrl: user.profilePhotoUrl,
          },
          isOwn: true,
        }, ...prev]);
      }

      haptics.success();
      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      setThreadError('Your comment was not sent. Your text is still here—please try again.');
      haptics.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { postId, isReply, parentId } = deleteTarget;
    try {
      await (isRequest
        ? api.deleteRequestDiscussionPost(requestId, postId)
        : api.deleteDiscussionPost(listingId, postId));

      if (isReply && parentId) {
        setReplies(prev => ({
          ...prev,
          [parentId]: (prev[parentId] || []).filter(r => r.id !== postId),
        }));
        setPosts(prev => prev.map(p =>
          p.id === parentId
            ? { ...p, replyCount: Math.max(0, (p.replyCount || 0) - 1) }
            : p
        ));
      } else {
        setPosts(prev => prev.filter(p => p.id !== postId));
      }
    } catch (error) {
      haptics.error();
    }
  };

  const confirmDelete = (postId, isReply = false, parentId = null) => {
    setDeleteTarget({ postId, isReply, parentId });
    setDeleteSheetVisible(true);
  };

  const startReply = (post) => {
    setReplyingTo(post);
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewComment('');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const openPrivateChat = async (post) => {
    if (openingChat.current) return;
    openingChat.current = true;
    try {
      const conversations = await api.getConversations();
      const existing = conversations.find(chat => chat.otherUser?.id === post.user.id);
      navigation.navigate('Chat', {
        conversationId: existing?.id, recipientId: post.user.id, recipient: post.user,
        threadContext: { ...threadContext, replyText: post.content },
        ...(isRequest ? {} : { listingId: targetId }),
      });
    } catch {
      setThreadError('Couldn’t open private chat. Please try again from the comment menu.');
    } finally { openingChat.current = false; }
  };

  const renderComment = (post, parentId = null) => (
    <View style={styles.commentRow}>
      <ShimmerImage placeholderIcon="person" source={{ uri: post.user.profilePhotoUrl || null }} style={styles.postAvatar} />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={styles.postAuthor}>{post.user.firstName} {post.user.lastName}</Text>
          <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
          <HapticPressable accessibilityLabel={`Comment options for ${post.user.firstName}`} style={styles.moreButton}
            onPress={() => setActionTarget({ post, parentId })}>
            <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSecondary} />
          </HapticPressable>
        </View>
        <Text style={styles.postContent}>{post.content}</Text>
        <HapticPressable style={styles.actionButton} accessibilityLabel={`Reply to ${post.user.firstName}`}
          onPress={() => startReply(parentId ? { id: parentId, user: post.user, content: post.content } : post)}>
          <Text style={styles.actionText}>Reply</Text>
        </HapticPressable>
      </View>
    </View>
  );

  const renderPost = ({ item: post }) => {
    const isExpanded = expandedPosts[post.id];
    return (
      <View style={styles.postCard}>
        {renderComment(post)}
        {post.replyCount > 0 && (
          <HapticPressable style={styles.threadToggle} onPress={() => toggleExpanded(post.id)}>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primary} />
            <Text style={styles.actionText}>{isExpanded ? 'Hide' : 'View'} {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</Text>
          </HapticPressable>
        )}
        {isExpanded && <View style={styles.repliesContainer}>
          {(replies[post.id] || []).map(reply => <View key={reply.id}>{renderComment(reply, post.id)}</View>)}
        </View>}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const renderInputBar = () => (
    <View testID="Comments.composer" style={[styles.composeContainer, {
      // The keyboard covers the home indicator; keep only a small typing gap.
      paddingBottom: keyboardVisible ? SPACING.sm : Math.max(insets.bottom, SPACING.md),
    }]}>
      {replyingTo && (
        <View style={styles.replyingToBar}>
          <Text style={styles.replyingToText} numberOfLines={2}>
            Replying to {replyingTo.user.firstName}: “{replyingTo.content.slice(0, 120)}”
          </Text>
          <HapticPressable haptic="light" onPress={cancelReply} accessibilityLabel="Cancel reply" style={styles.cancelReplyButton}>
            <Ionicons name="close" size={18} color={COLORS.textSecondary} />
          </HapticPressable>
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={newComment}
          onChangeText={setNewComment}
          placeholder={replyingTo ? 'Write a reply…' : 'Add a comment…'}
          accessibilityLabel="Comment"
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={2000}
          autoCapitalize="sentences"
          autoCorrect={true}
          spellCheck={true}
        />
        <HapticPressable
          haptic="medium"
          accessibilityRole="button" accessibilityLabel={replyingTo ? "Post reply" : "Post comment"}
          style={[styles.sendButton, (!newComment.trim() || isSubmitting) && styles.sendButtonDisabled]}
          onPress={handleSubmit}
          disabled={!newComment.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </HapticPressable>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      testID="Comments.keyboardLayout"
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {/* Header */}
      <HapticPressable style={styles.listingHeader} accessibilityRole="button" accessibilityLabel="View original post"
        onPress={() => navigation.navigate(isRequest ? 'RequestDetail' : 'ListingDetail', { id: targetId })}>
        <Text style={styles.listingTitle} numberOfLines={2}>{targetTitle || (isRequest ? 'Neighbor request' : 'Shared item')}</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Visible to people who can see this post.</Text>
        <Text style={{ color: COLORS.primary, fontSize: 12, marginTop: 4 }}>View original post →</Text>
      </HapticPressable>
      {!!threadError && <Text accessibilityRole="alert" style={{ color: COLORS.danger, padding: 16 }}>{threadError}</Text>}

      <FlatList
        style={styles.list}
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.gray[600]} />
            <Text style={styles.emptyTitle}>{isRequest ? 'No responses yet' : 'No comments yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {isRequest
                ? 'Be the first to respond to this request'
                : 'Be the first to ask a question about this item'}
            </Text>
          </View>
        }
      />

      {/* Input Bar */}
      {renderInputBar()}

      <ActionSheet
        isVisible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? `${actionTarget.post.user.firstName}’s comment` : 'Comment'}
        actions={actionTarget ? [
          ...(!actionTarget.post.isOwn && actionTarget.post.user.id !== user?.id ? [{
            label: `Message ${actionTarget.post.user.firstName} privately`,
            onPress: () => openPrivateChat(actionTarget.post),
          }] : []),
          ...((actionTarget.post.isOwn || isOwner) ? [{
            label: 'Delete comment', destructive: true,
            onPress: () => confirmDelete(actionTarget.post.id, !!actionTarget.parentId, actionTarget.parentId),
          }] : []),
        ] : []}
      />

      <ActionSheet
        isVisible={deleteSheetVisible}
        onClose={() => setDeleteSheetVisible(false)}
        title="Delete comment"
        message="Delete this comment?"
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: handleDelete,
          },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  listingHeader: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    ...SHADOWS.sm,
  },
  listingTitle: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  list: { flex: 1 },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  postCard: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  commentRow: { flexDirection: 'row', gap: SPACING.sm },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  threadToggle: { marginLeft: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  postAvatar: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.gray[700],
    borderWidth: 2,
    borderColor: COLORS.surfaceElevated,
  },
  postMeta: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  postAuthor: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  postDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  moreButton: { marginLeft: 'auto', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  postContent: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    lineHeight: 23,
    marginBottom: 0,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  actionButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  actionText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  repliesContainer: {
    marginLeft: 16,
    paddingLeft: SPACING.md,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primaryMuted,
    gap: SPACING.sm,
  },
  reply: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  replyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.gray[700],
  },
  replyContent: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  replyAuthor: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '600',
    color: COLORS.text,
  },
  replyDate: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  replyText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  deleteButton: {
    marginTop: SPACING.sm,
  },
  deleteText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '500',
    color: COLORS.danger,
  },
  composeContainer: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  replyingToBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryMuted,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  replyingToText: {
    flex: 1,
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.primary,
  },
  cancelReplyButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.md,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    minHeight: 44,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.gray[700],
    ...SHADOWS.sm,
  },
});
