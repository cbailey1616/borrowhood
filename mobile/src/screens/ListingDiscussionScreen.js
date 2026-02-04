import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../utils/config';

export default function ListingDiscussionScreen({ route, navigation }) {
  const { listingId, listing, autoFocus } = route.params;
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [expandedPosts, setExpandedPosts] = useState({});
  const [replies, setReplies] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchPosts();
  }, [listingId]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, [autoFocus]);

  const fetchPosts = async () => {
    try {
      const data = await api.getDiscussions(listingId, { limit: 50 });
      setPosts(data.posts || []);
    } catch (error) {
      console.error('Failed to fetch discussions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchReplies = async (postId) => {
    try {
      const data = await api.getDiscussionReplies(listingId, postId);
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
    try {
      const data = {
        content: newComment.trim(),
        parentId: replyingTo?.id || undefined,
      };

      const result = await api.createDiscussionPost(listingId, data);

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

      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (postId, isReply = false, parentId = null) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteDiscussionPost(listingId, postId);

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
              Alert.alert('Error', 'Failed to delete post');
            }
          },
        },
      ]
    );
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

  const renderReply = (reply, parentId) => (
    <View key={reply.id} style={styles.reply}>
      <Image
        source={{ uri: reply.user.profilePhotoUrl || 'https://via.placeholder.com/28' }}
        style={styles.replyAvatar}
      />
      <View style={styles.replyContent}>
        <View style={styles.replyHeader}>
          <Text style={styles.replyAuthor}>
            {reply.user.firstName} {reply.user.lastName}
          </Text>
          <Text style={styles.replyDate}>{formatDate(reply.createdAt)}</Text>
        </View>
        <Text style={styles.replyText}>{reply.content}</Text>
        {(reply.isOwn || listing?.isOwner) && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(reply.id, true, parentId)}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderPost = ({ item: post }) => {
    const isExpanded = expandedPosts[post.id];
    const postReplies = replies[post.id] || [];

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <Image
            source={{ uri: post.user.profilePhotoUrl || 'https://via.placeholder.com/40' }}
            style={styles.postAvatar}
          />
          <View style={styles.postMeta}>
            <Text style={styles.postAuthor}>
              {post.user.firstName} {post.user.lastName}
            </Text>
            <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
          </View>
          {(post.isOwn || listing?.isOwner) && (
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => handleDelete(post.id)}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.postContent}>{post.content}</Text>

        <View style={styles.postActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => startReply(post)}>
            <Ionicons name="arrow-undo-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.actionText}>Reply</Text>
          </TouchableOpacity>

          {post.replyCount > 0 && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => toggleExpanded(post.id)}
            >
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={COLORS.primary}
              />
              <Text style={[styles.actionText, { color: COLORS.primary }]}>
                {isExpanded ? 'Hide' : 'View'} {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isExpanded && (
          <View style={styles.repliesContainer}>
            {postReplies.map(reply => renderReply(reply, post.id))}
          </View>
        )}
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
    <View style={styles.composeContainer}>
      {replyingTo && (
        <View style={styles.replyingToBar}>
          <Text style={styles.replyingToText}>
            Replying to {replyingTo.user.firstName}
          </Text>
          <TouchableOpacity onPress={cancelReply}>
            <Ionicons name="close" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={newComment}
          onChangeText={setNewComment}
          placeholder={replyingTo ? 'Write a reply...' : 'Ask a question...'}
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!newComment.trim() || isSubmitting) && styles.sendButtonDisabled]}
          onPress={handleSubmit}
          disabled={!newComment.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Listing Header */}
      {listing && (
        <View style={styles.listingHeader}>
          <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
        </View>
      )}

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.gray[600]} />
            <Text style={styles.emptyTitle}>No questions yet</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to ask a question about this item
            </Text>
          </View>
        }
      />

      {/* Input Bar */}
      {renderInputBar()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: 120,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  postCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  postAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray[700],
    borderWidth: 2,
    borderColor: COLORS.surfaceElevated,
  },
  postMeta: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  postAuthor: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  postDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  moreButton: {
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  postContent: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 23,
    marginBottom: SPACING.md,
  },
  postActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  actionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  repliesContainer: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
    gap: SPACING.md,
  },
  reply: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  replyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  replyDate: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  replyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  deleteButton: {
    marginTop: SPACING.sm,
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.danger,
  },
  composeContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[800],
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
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
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.primary,
  },
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
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
