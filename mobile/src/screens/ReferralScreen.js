import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Share,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import { useError } from '../context/ErrorContext';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

const TARGET = 3;

export default function ReferralScreen() {
  const { showError, showToast } = useError();
  const [referralCode, setReferralCode] = useState('');
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [codeRes, statusRes] = await Promise.all([
        api.getReferralCode(),
        api.getReferralStatus(),
      ]);
      setReferralCode(codeRes.referralCode);
      setStatus(statusRes);
    } catch (error) {
      showError({ message: 'Failed to load referral info' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(referralCode);
    haptics.success();
    showToast('Referral code copied!');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on BorrowHood! Use my referral code ${referralCode} when you sign up. Borrow and lend with your neighbors!`,
      });
      haptics.light();
    } catch (error) {
      // User cancelled share
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      await api.claimReferralReward();
      haptics.success();
      showToast('Free Plus activated for 1 year!');
      fetchData();
    } catch (error) {
      showError({ message: error.message || 'Failed to claim reward' });
    } finally {
      setIsClaiming(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const count = status?.referralCount || 0;
  const progress = Math.min(count / TARGET, 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <BlurCard style={styles.heroCard}>
        <Ionicons name="gift" size={48} color={COLORS.primary} />
        <Text style={styles.heroTitle}>Invite Friends, Get Plus Free</Text>
        <Text style={styles.heroSubtitle}>
          Invite {TARGET} friends to join BorrowHood and earn a free year of Plus!
        </Text>
      </BlurCard>

      {/* Progress */}
      <BlurCard style={styles.progressCard}>
        <Text style={styles.progressTitle}>Your Progress</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {count} of {TARGET} friends joined
        </Text>

        {/* Milestone dots */}
        <View style={styles.milestones}>
          {[1, 2, 3].map(i => (
            <View key={i} style={styles.milestone}>
              <View style={[
                styles.milestoneDot,
                count >= i && styles.milestoneDotCompleted,
              ]}>
                {count >= i && (
                  <Ionicons name="checkmark" size={14} color={COLORS.background} />
                )}
              </View>
              <Text style={styles.milestoneLabel}>Friend {i}</Text>
            </View>
          ))}
        </View>
      </BlurCard>

      {/* Referral Code */}
      <BlurCard style={styles.codeCard}>
        <Text style={styles.codeLabel}>Your Referral Code</Text>
        <View style={styles.codeRow}>
          <Text style={styles.codeText}>{referralCode}</Text>
          <HapticPressable
            style={styles.copyButton}
            onPress={handleCopy}
            haptic="light"
          >
            <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
          </HapticPressable>
        </View>

        <HapticPressable
          style={styles.shareButton}
          onPress={handleShare}
          haptic="medium"
        >
          <Ionicons name="share-outline" size={20} color={COLORS.background} />
          <Text style={styles.shareButtonText}>Share with Friends</Text>
        </HapticPressable>
      </BlurCard>

      {/* Claim Reward */}
      {status?.eligible && (
        <BlurCard style={styles.claimCard}>
          <Ionicons name="trophy" size={32} color={COLORS.warning} />
          <Text style={styles.claimTitle}>You did it!</Text>
          <Text style={styles.claimSubtitle}>
            Claim your free year of Plus now
          </Text>
          <HapticPressable
            style={styles.claimButton}
            onPress={handleClaim}
            disabled={isClaiming}
            haptic="heavy"
          >
            {isClaiming ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.claimButtonText}>Claim Free Plus</Text>
            )}
          </HapticPressable>
        </BlurCard>
      )}

      {status?.rewardClaimed && (
        <BlurCard style={styles.claimedCard}>
          <Ionicons name="checkmark-circle" size={32} color={COLORS.secondary} />
          <Text style={styles.claimedText}>Plus reward active!</Text>
        </BlurCard>
      )}

      {/* Referred Friends List */}
      {status?.referredFriends?.length > 0 && (
        <BlurCard style={styles.friendsCard}>
          <Text style={styles.friendsTitle}>Referred Friends</Text>
          {status.referredFriends.map(friend => (
            <View key={friend.id} style={styles.friendRow}>
              <Image
                source={{ uri: friend.profilePhotoUrl || 'https://via.placeholder.com/36' }}
                style={styles.friendAvatar}
              />
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>
                  {friend.firstName} {friend.lastName}
                </Text>
                <Text style={styles.friendDate}>
                  Joined {new Date(friend.joinedAt).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.secondary} />
            </View>
          ))}
        </BlurCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.xl,
    gap: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  // Hero
  heroCard: {
    alignItems: 'center',
    padding: SPACING.xxl,
    gap: SPACING.md,
  },
  heroTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Progress
  progressCard: {
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  progressTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
  },
  milestones: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.sm,
  },
  milestone: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  milestoneDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  milestoneDotCompleted: {
    backgroundColor: COLORS.secondary,
  },
  milestoneLabel: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
  },
  // Code
  codeCard: {
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  codeLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  codeText: {
    ...TYPOGRAPHY.title3,
    color: COLORS.text,
    fontWeight: '700',
    letterSpacing: 1,
  },
  copyButton: {
    padding: SPACING.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
  },
  shareButtonText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.background,
  },
  // Claim
  claimCard: {
    alignItems: 'center',
    padding: SPACING.xxl,
    gap: SPACING.md,
  },
  claimTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
  },
  claimSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  claimButton: {
    backgroundColor: COLORS.warning,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    width: '100%',
  },
  claimButtonText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.background,
  },
  // Claimed
  claimedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  claimedText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.secondary,
  },
  // Friends
  friendsCard: {
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  friendsTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.text,
  },
  friendDate: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
});
