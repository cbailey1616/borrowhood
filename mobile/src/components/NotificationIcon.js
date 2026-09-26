import { View, StyleSheet } from 'react-native';
import Icon from './Icon';
import { COLORS } from '../utils/config';
import { listingIcon } from '../utils/listingPresentation';
import { requestPresentation } from '../utils/requestPresentation';

const TONES = {
  gold: { backgroundColor: COLORS.warningMuted },
  sage: { backgroundColor: COLORS.primaryMuted },
  blue: { backgroundColor: COLORS.infoMuted },
  clay: { backgroundColor: COLORS.accentMuted },
  attention: { backgroundColor: COLORS.warningMuted, color: COLORS.warning, illustrated: false },
  danger: { backgroundColor: COLORS.dangerMuted, color: COLORS.danger, illustrated: false },
};

const APPEARANCE = {
  borrow_request: [listingIcon(), 'clay'],
  giveaway_claim: ['gift', 'clay'],
  request_approved: ['checkmark-circle', 'sage'],
  request_declined: ['close-circle', 'danger'],
  borrow_cancelled: ['close-circle', 'danger'],
  payment_confirmed: ['card', 'sage'],
  pickup_confirmed: [listingIcon(), 'sage'],
  pickup_check: ['basket', 'gold'],
  pickup_extended: ['time', 'gold'],
  return_requested: ['checkbox', 'gold'],
  return_confirmed: ['checkbox', 'sage'],
  return_reminder: ['alarm', 'gold'],
  return_date_extended: ['calendar', 'blue'],
  return_reported_missing: ['alert-circle', 'danger'],
  return_case_updated: ['shield', 'blue'],
  giveaway_complete: ['gift', 'sage'],
  giveaway_expired: ['time', 'attention'],
  giveaway_pickup_expired: ['alarm', 'attention'],
  exchange_account_deleted: ['alert-circle', 'attention'],
  dispute_opened: ['warning', 'attention'],
  dispute_filed_against_you: ['alert-circle', 'danger'],
  dispute_counter_received: ['swap-horizontal', 'blue'],
  dispute_response_received: ['chat-reply', 'blue'],
  dispute_ready_for_review: ['eye', 'blue'],
  dispute_under_review: ['time', 'blue'],
  dispute_auto_advanced: ['time', 'attention'],
  dispute_resolved: ['checkmark-done', 'sage'],
  new_rating: ['star', 'gold'],
  rating_received: ['star', 'gold'],
  rank_up: ['trophy', 'gold'],
  rank_down: ['ribbon', 'gold'],
  rank_ready: ['ribbon', 'gold'],
  join_request: ['person-add', 'sage'],
  join_approved: ['people', 'sage'],
  request_offer: [listingIcon(), 'clay'],
  new_request: [requestPresentation().icon, 'clay'],
  new_message: ['chatbubble', 'blue'],
  listing_comment: ['chat-question', 'blue'],
  request_comment: ['chat-reply', 'sage'],
  discussion_reply: ['chat-reply', 'sage'],
  friend_request: ['person-add', 'sage'],
  friend_accepted: ['people', 'sage'],
  referral_joined: ['gift', 'clay'],
  referral_reward: ['trophy', 'gold'],
  payment_failed: ['card', 'danger'],
  verification_failed: ['shield-checkmark', 'attention'],
  verification_expiring: ['shield-checkmark', 'attention'],
  circle_invite: ['people', 'sage'],
};

// Read status is shown by the row and unread dot; the illustration keeps its color.
export default function NotificationIcon({ notification = {}, size = 44 }) {
  const [name, tone] = notification.queueListingId
    ? ['people', 'clay']
    : APPEARANCE[notification.type] || ['notifications', 'gold'];
  const { backgroundColor, color = COLORS.primary, illustrated = true } = TONES[tone];
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor }]}>
      <Icon name={name} size={Math.round(size * 0.6)} color={color} illustrated={illustrated} selected />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
