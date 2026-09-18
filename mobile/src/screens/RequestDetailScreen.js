import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import useNavigationTask from '../hooks/useNavigationTask';
import ShimmerImage from '../components/ShimmerImage';
import TownIdentityPrompt from '../components/TownIdentityPrompt';
import LayeredCard from '../components/LayeredCard';
import HapticPressable from '../components/HapticPressable';
import ActionButton from '../components/ActionButton';
import ActionSheet from '../components/ActionSheet';
import PopupLayer from '../components/PopupLayer';
import VerifiedBadge from '../components/VerifiedBadge';
import NeighborRankBadge from '../components/NeighborRankBadge';
import RankInfoSheet from '../components/RankInfoSheet';
import { Ionicons } from '../components/Icon';
import { memberReputation } from '../utils/reputation';
import { requestPresentation } from '../utils/requestPresentation';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';

const calendarDate = value => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};
const neededDates = (from, until) => from && until ? `${calendarDate(from)} – ${calendarDate(until)}`
  : from ? `From ${calendarDate(from)}` : until ? `By ${calendarDate(until)}` : null;

export default function RequestDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { user } = useAuth();
  const { showToast } = useError();
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const startNavigationTask = useNavigationTask(navigation, `${id}:${user?.id}`);
  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [withdrawItem, setWithdrawItem] = useState(null);
  const [withdrawing, setWithdrawing] = useState(null);
  const withdrawingRef = useRef(false);
  const deletingRef = useRef(false);
  const openingChat = useRef(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [offers, setOffers] = useState([]);
  const [offerError, setOfferError] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [discussions, setDiscussions] = useState([]);
  const [discussionCount, setDiscussionCount] = useState(0);
  const [discussionError, setDiscussionError] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showRank, setShowRank] = useState(false);

  useEffect(() => {
    setRequest(null); setIsLoading(true); setLoadError(false);
    setOffers([]); setDiscussions([]); setDiscussionCount(0);
    setOfferError(false); setDiscussionError(false); setMessageError('');
    setShowPhoto(false); setShowRank(false); setWithdrawItem(null); setShowDeleteSheet(false);
  }, [id, user?.id]);

  const fetchOffers = useCallback(async () => {
    const isCurrent = startNavigationTask();
    setOffersLoading(true);
    try {
      const data = await api.getRequestOffers(id);
      if (isCurrent()) { setOffers(data || []); setOfferError(false); }
    } catch {
      if (isCurrent()) setOfferError(true);
    } finally {
      if (isCurrent()) setOffersLoading(false);
    }
  }, [id, startNavigationTask]);

  const fetchDiscussions = useCallback(async () => {
    const isCurrent = startNavigationTask();
    try {
      const data = await api.getRequestDiscussions(id, { limit: 3 });
      if (isCurrent()) {
        setDiscussions(data.posts || []); setDiscussionCount(data.total || 0); setDiscussionError(false);
      }
    } catch {
      if (isCurrent()) setDiscussionError(true);
    }
  }, [id, startNavigationTask]);

  const fetchRequest = useCallback(async () => {
    const isCurrent = startNavigationTask();
    try {
      const data = await api.getRequest(id);
      if (!isCurrent()) return;
      setRequest(data); setLoadError(false);
      if (!data.ownerMasked && !data.previewOnly) {
        fetchDiscussions();
        if (data.type === 'service') { setOffers([]); setOfferError(false); }
        else fetchOffers();
      } else { setDiscussions([]); setDiscussionCount(0); setOffers([]); }
    } catch {
      if (isCurrent()) setLoadError(true);
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [id, user?.id, startNavigationTask, fetchDiscussions, fetchOffers]);

  useFocusEffect(useCallback(() => {
    setIsOpeningChat(false);
    fetchRequest();
  }, [fetchRequest]));

  const openServiceChat = async () => {
    if (openingChat.current) return;
    const isCurrent = startNavigationTask();
    openingChat.current = true; setIsOpeningChat(true); setMessageError('');
    try {
      const current = await api.getRequest(id);
      if (!isCurrent()) return;
      setRequest(current);
      if (current.ownerMasked || current.previewOnly || current.isOwner || !current.requester?.id
          || current.type !== 'service' || current.status !== 'open' || current.isExpired) {
        setMessageError('This wanted post is no longer accepting replies.');
        return;
      }
      const conversations = await api.getConversations();
      if (!isCurrent()) return;
      const existing = conversations.find(chat => chat.otherUser?.id === current.requester.id);
      navigation.navigate('Chat', {
        conversationId: existing?.id, recipientId: current.requester.id, recipient: current.requester,
        threadContext: { id: current.id, type: 'request', requestType: 'service', title: current.title },
      });
    } catch {
      if (isCurrent()) setMessageError('Couldn’t open chat. Please try again.');
    } finally {
      openingChat.current = false;
      if (isCurrent()) setIsOpeningChat(false);
    }
  };

  const performDelete = async () => {
    if (deletingRef.current) return;
    const isCurrent = startNavigationTask();
    deletingRef.current = true; setIsDeleting(true);
    try {
      await api.deleteRequest(id);
      if (!isCurrent()) return;
      haptics.success(); navigation.goBack();
    } catch {
      if (isCurrent()) showToast('Couldn’t close the post. Please try again.', 'error');
    } finally {
      deletingRef.current = false;
      if (isCurrent()) setIsDeleting(false);
    }
  };

  const performWithdraw = async () => {
    if (!withdrawItem || withdrawingRef.current) return;
    const item = withdrawItem;
    const isCurrent = startNavigationTask();
    withdrawingRef.current = true; setWithdrawing(item.id);
    try {
      await api.withdrawOffer(id, item.id);
      if (!isCurrent()) return;
      setOffers(previous => previous.filter(offer => offer.id !== item.id));
      haptics.success();
    } catch {
      if (isCurrent()) showToast('Couldn’t withdraw the offer. Please try again.', 'error');
    } finally {
      withdrawingRef.current = false;
      if (isCurrent()) { setWithdrawing(null); setWithdrawItem(null); }
    }
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.spinner} /></View>;
  if (!request) return <View style={styles.center}>
    <Text style={styles.body}>Couldn’t load this wanted post.</Text>
    <ActionButton label="Try again" onPress={fetchRequest} />
  </View>;

  const acceptingOffers = request.status === 'open' && !request.isExpired;
  const privateAccess = !request.ownerMasked && !request.previewOnly;
  const requester = request.requester || {};
  const reputation = memberReputation(requester);
  const presentation = requestPresentation(request.type);
  const dateRange = neededDates(request.neededFrom, request.neededUntil);
  const status = request.isExpired ? 'Expired' : acceptingOffers ? 'Open' : 'Closed';
  const postedDate = request.createdAt && new Date(request.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const showComments = privateAccess && (acceptingOffers || discussions.length > 0 || discussionCount > 0 || discussionError);
  const showOffers = privateAccess && request.type !== 'service'
    && (offers.length > 0 || offerError || offersLoading || (request.isOwner && acceptingOffers));
  const openComments = autoFocus => navigation.navigate('ListingDiscussion', { requestId: id, request, ...(autoFocus ? { autoFocus: true } : {}) });
  const ownerActions = privateAccess && request.isOwner && request.status === 'open';
  const responderAction = privateAccess && !request.isOwner && acceptingOffers;

  return <View style={styles.container}>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
      {loadError && <ActionButton label="Couldn’t refresh. Try again" onPress={fetchRequest} />}
      <LayeredCard radius={RADIUS.xl}>
        <View style={styles.requestCard}>
          <View style={styles.summary}>
            <View style={styles.metaRow}>
              <View style={styles.typeLabel}>
                <Ionicons name={presentation.icon} size={18} illustrated color={COLORS.primary} />
                <Text style={styles.metaText}>{presentation.label}</Text>
              </View>
              <View style={[styles.statusBadge, acceptingOffers && styles.openBadge]}>
                <Text style={[styles.statusText, acceptingOffers && styles.openText]}>{status}</Text>
              </View>
            </View>
            <Text style={styles.title} accessibilityRole="header">{request.title}</Text>
            {!acceptingOffers && <Text style={styles.metaText}>
              {request.isExpired && request.isOwner ? 'Renew from My Posts.' : 'No longer accepting offers.'}
            </Text>}
          </View>
          {!!request.photoUrl && <HapticPressable style={styles.photoFrame} onPress={() => setShowPhoto(true)}
            accessibilityRole="button" accessibilityLabel="View full wanted photo" testID="Request.photo">
            <ShimmerImage source={{ uri: request.photoUrl }} contentFit="cover" contentPosition="center"
              accessibilityLabel="Wanted item photo" style={styles.photo} />
            <View style={styles.expandPhoto}><Ionicons name="expand-outline" size={18} color={COLORS.primary} /></View>
          </HapticPressable>}
          {(request.description || dateRange || request.category) && <View style={styles.details}>
            {!!request.description && <Text style={styles.body}>{request.description}</Text>}
            {!!dateRange && <View style={styles.detailRow}>
              <Ionicons name="calendar" size={18} illustrated color={COLORS.primary} />
              <Text style={styles.metaText}>Needed {dateRange}</Text>
            </View>}
            {!!request.category && <Text style={styles.category}>{request.category}</Text>}
          </View>}
          {privateAccess && requester.id && <HapticPressable style={styles.requesterRow}
            accessibilityRole="button" accessibilityLabel={`View ${requester.firstName}’s profile`}
            onPress={() => navigation.navigate('UserProfile', { id: requester.id })}>
            <ShimmerImage placeholderIcon="person" source={{ uri: requester.profilePhotoUrl }} style={styles.avatar} />
            <View style={styles.personInfo}>
              <View style={styles.personNameRow}>
                <Text style={styles.personName}>{requester.firstName} {requester.lastName}</Text>
                {requester.isVerified === true && <VerifiedBadge size={16} />}
                <NeighborRankBadge rank={reputation.rank} onPress={() => setShowRank(true)} />
              </View>
              <Text style={styles.metaText}>{postedDate ? `Posted ${postedDate}` : 'Posted by'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </HapticPressable>}
        </View>
      </LayeredCard>

      {!privateAccess && <TownIdentityPrompt onVerify={() => navigation.navigate('IdentityVerification', { source: 'town_browse' })} />}

      {showOffers && <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.typeLabel}>
            <Ionicons name="lock-closed" size={18} illustrated color={COLORS.primary} />
            <Text style={styles.sectionTitle} accessibilityRole="header">Private offers</Text>
          </View>
          {offers.length > 0 && <Text style={styles.metaText}>{offers.length}</Text>}
        </View>
        {offers.length > 0 && <Text style={styles.sectionHint}>Only you and the other person can see these.</Text>}
        {offerError && <ActionButton label="Couldn’t load offers. Try again" onPress={fetchOffers} />}
        {offersLoading && offers.length === 0 ? <ActivityIndicator color={COLORS.spinner} />
          : !offerError && offers.length === 0 && <Text style={styles.metaText}>No offers yet.</Text>}
        {offers.map(item => <LayeredCard key={item.id}>
          <View style={styles.offerCard}>
            <HapticPressable style={styles.offerRow} accessibilityRole="button" accessibilityLabel={`View offered item: ${item.title}`}
              onPress={() => navigation.navigate('ListingDetail', { id: item.id })}>
              <ShimmerImage source={item.photoUrl ? { uri: item.photoUrl } : null} placeholderIcon="cube" style={styles.offerPhoto} />
              <View style={styles.offerContent}>
                <Text style={styles.offerTitle}>{item.title}</Text>
                <Text style={styles.metaText}>{item.isOwn ? 'Your offer' : 'View item'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
            </HapticPressable>
            {item.isOwn && <HapticPressable style={styles.withdrawButton} onPress={() => setWithdrawItem(item)}
              disabled={!!withdrawing} accessibilityRole="button" accessibilityLabel={`Withdraw offer: ${item.title}`}
              accessibilityState={{ disabled: !!withdrawing, busy: withdrawing === item.id }}>
              {withdrawing === item.id ? <ActivityIndicator color={COLORS.danger} /> : <Text style={styles.withdrawText}>Withdraw offer</Text>}
            </HapticPressable>}
          </View>
        </LayeredCard>)}
      </View>}

      {showComments && <LayeredCard><View style={styles.commentsCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Comments{discussionCount > 0 ? ` (${discussionCount})` : ''}</Text>
          {discussionCount > discussions.length && <HapticPressable style={styles.viewAll} onPress={() => openComments(false)}
            accessibilityRole="button" accessibilityLabel="View all comments"><Text style={styles.linkText}>View all</Text></HapticPressable>}
        </View>
        {discussionError && <ActionButton label="Couldn’t load comments. Try again" onPress={fetchDiscussions} />}
        {discussions.map(post => <HapticPressable key={post.id} style={styles.commentRow}
          accessibilityRole="button" accessibilityLabel={`Comment by ${post.user?.firstName || 'a neighbor'}: ${post.content}`}
          onPress={() => openComments(false)}>
          <ShimmerImage placeholderIcon="person" source={{ uri: post.user?.profilePhotoUrl }} style={styles.commentAvatar} />
          <View style={styles.offerContent}>
            <Text style={styles.commentAuthor}>{post.user?.firstName} {post.user?.lastName}</Text>
            <Text style={styles.metaText} numberOfLines={2}>{post.content}</Text>
            {post.replyCount > 0 && <Text style={styles.linkText}>{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </HapticPressable>)}
        {acceptingOffers && <ActionButton label="Add a comment" onPress={() => openComments(true)} />}
      </View></LayeredCard>}
    </ScrollView>

    {!!messageError && <Text accessibilityRole="alert" style={styles.messageError}>{messageError}</Text>}
    {(responderAction || ownerActions) && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
      <View style={[styles.footerContent, (fontScale > 1.3 || width < 360) && styles.stackedActions]}>
        {responderAction && <HapticPressable style={styles.primaryButton} disabled={isOpeningChat}
          accessibilityRole="button" accessibilityLabel={request.type === 'service' ? 'I can help' : 'Offer an item privately'}
          accessibilityState={{ disabled: isOpeningChat, busy: isOpeningChat }}
          onPress={request.type === 'service' ? openServiceChat : () => navigation.navigate('OfferItem', { request })}>
          {isOpeningChat ? <ActivityIndicator color={COLORS.surface} /> : <>
            <Ionicons name={request.type === 'service' ? 'chatbubble-outline' : 'add'} size={20} color={COLORS.surface} />
            <Text style={styles.primaryText}>{request.type === 'service' ? 'I can help' : 'Offer an item'}</Text>
          </>}
        </HapticPressable>}
        {ownerActions && <>
          <HapticPressable style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Edit post"
            onPress={() => navigation.navigate('EditRequest', { request })}><Text style={styles.primaryText}>Edit post</Text></HapticPressable>
          <HapticPressable style={[styles.primaryButton, styles.closeButton]} disabled={isDeleting}
            accessibilityRole="button" accessibilityLabel="Close post" accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
            onPress={() => setShowDeleteSheet(true)}>
            {isDeleting ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.primaryText}>Close post</Text>}
          </HapticPressable>
        </>}
      </View>
    </View>}

    <ActionSheet isVisible={showDeleteSheet} onClose={() => setShowDeleteSheet(false)} variant="confirmation"
      title="Close this wanted post?" message="Neighbors won’t be able to send new offers."
      actions={[{ label: 'Close post', destructive: true, onPress: performDelete }]} />
    <ActionSheet isVisible={!!withdrawItem} onClose={() => setWithdrawItem(null)} variant="confirmation"
      title="Withdraw this offer?" message="The person who posted will lose access to this offer. An approved exchange stays available."
      actions={[{ label: 'Withdraw offer', destructive: true, onPress: performWithdraw }]} />
    <RankInfoSheet isVisible={showRank && privateAccess} onClose={() => setShowRank(false)} currentRank={reputation.rank} isNew={reputation.isNew} />
    <PopupLayer visible={showPhoto} onRequestClose={() => setShowPhoto(false)}>
      <View style={[styles.photoViewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]} onAccessibilityEscape={() => setShowPhoto(false)}>
        <HapticPressable style={styles.photoClose} onPress={() => setShowPhoto(false)} accessibilityRole="button" accessibilityLabel="Close photo">
          <Ionicons name="close" size={24} color={COLORS.surface} />
        </HapticPressable>
        <ShimmerImage source={{ uri: request.photoUrl }} contentFit="contain" contentPosition="center"
          accessibilityLabel="Full wanted photo" style={styles.fullPhoto} />
      </View>
    </PopupLayer>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.md },
  content: { padding: SPACING.lg, gap: SPACING.lg, width: '100%', maxWidth: 680, alignSelf: 'center' },
  requestCard: { borderRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: COLORS.surface },
  summary: { padding: SPACING.lg, gap: SPACING.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACING.sm },
  typeLabel: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: SPACING.xs },
  statusBadge: { backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  openBadge: { backgroundColor: COLORS.primaryMuted },
  statusText: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
  openText: { color: COLORS.primary },
  title: { ...TYPOGRAPHY.h2, fontSize: 25, color: COLORS.text },
  body: { ...TYPOGRAPHY.body, color: COLORS.text },
  metaText: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, flexShrink: 1 },
  photoFrame: { marginHorizontal: SPACING.sm, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.surfaceElevated },
  photo: { width: '100%', aspectRatio: 1.6, maxHeight: 340 },
  expandPhoto: { position: 'absolute', bottom: SPACING.sm, right: SPACING.sm, width: 32, height: 32, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  details: { padding: SPACING.lg, gap: SPACING.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  category: { ...TYPOGRAPHY.caption1, color: COLORS.textMuted },
  requesterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceElevated },
  personInfo: { flex: 1, minWidth: 0 },
  personNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  personName: { ...TYPOGRAPHY.subheadline, color: COLORS.text, flexShrink: 1 },
  section: { gap: SPACING.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  sectionTitle: { ...TYPOGRAPHY.headline, color: COLORS.text, flexShrink: 1 },
  sectionHint: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  offerCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden' },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  offerPhoto: { width: 52, height: 52, borderRadius: RADIUS.md, flexShrink: 0 },
  offerContent: { flex: 1, minWidth: 0, gap: SPACING.xs },
  offerTitle: { ...TYPOGRAPHY.subheadline, color: COLORS.text, flexShrink: 1 },
  withdrawButton: { minHeight: 44, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator, justifyContent: 'center', alignItems: 'flex-end' },
  withdrawText: { ...TYPOGRAPHY.footnote, color: COLORS.danger },
  commentsCard: { padding: SPACING.lg, gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  commentAvatar: { width: 32, height: 32, borderRadius: RADIUS.full },
  commentAuthor: { ...TYPOGRAPHY.footnote, color: COLORS.text },
  linkText: { ...TYPOGRAPHY.footnote, color: COLORS.primary },
  viewAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.sm },
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.separator, backgroundColor: COLORS.surface },
  footerContent: { flexDirection: 'row', gap: SPACING.sm, width: '100%', maxWidth: 648, alignSelf: 'center' },
  stackedActions: { flexDirection: 'column' },
  primaryButton: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.primary },
  primaryText: { ...TYPOGRAPHY.subheadline, color: COLORS.surface, flexShrink: 1, textAlign: 'center' },
  closeButton: { backgroundColor: COLORS.danger },
  messageError: { ...TYPOGRAPHY.footnote, color: COLORS.danger, padding: SPACING.md },
  photoViewer: { flex: 1, backgroundColor: COLORS.primaryDark },
  photoClose: { minHeight: 48, width: 48, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', margin: SPACING.sm },
  fullPhoto: { flex: 1, width: '100%' },
});
