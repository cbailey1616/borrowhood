import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';

export default function SustainabilityScreen() {
  const [stats, setStats] = useState(null);
  const [communityStats, setCommunityStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userStats, community] = await Promise.all([
        api.getSustainabilityStats(),
        api.getCommunitySustainability(),
      ]);
      setStats(userStats);
      setCommunityStats(community);
      haptics.success();
    } catch (err) {
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const StatCard = ({ icon, value, label, sublabel, index }) => (
    <AnimatedCard index={index} style={styles.statCardWrapper}>
      <BlurCard style={styles.statCard}>
        <Text style={styles.statIcon}>{icon}</Text>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        {sublabel && <Text style={styles.statSublabel}>{sublabel}</Text>}
      </BlurCard>
    </AnimatedCard>
  );

  const ImpactRow = ({ icon, label, value, unit }) => (
    <View style={styles.impactRow}>
      <Text style={styles.impactIcon}>{icon}</Text>
      <Text style={styles.impactLabel}>{label}</Text>
      <View style={styles.impactValueContainer}>
        <Text style={styles.impactValue}>{value}</Text>
        <Text style={styles.impactUnit}>{unit}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Impact</Text>
        <Text style={styles.subtitle}>
          See how sharing makes a difference
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          index={0}
          icon="🔄"
          value={stats?.totalBorrows || 0}
          label="Items Borrowed"
        />
        <StatCard
          index={1}
          icon="🤝"
          value={stats?.totalLends || 0}
          label="Items Lent"
        />
        <StatCard
          index={2}
          icon="💰"
          value={`$${(stats?.moneySavedCents / 100 || 0).toFixed(0)}`}
          label="Money Saved"
        />
        <StatCard
          index={3}
          icon="🌍"
          value={`${(stats?.co2SavedKg || 0).toFixed(1)}kg`}
          label="CO₂ Saved"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Environmental Impact</Text>
        <AnimatedCard index={4}>
          <BlurCard style={styles.impactCard}>
            <ImpactRow
              icon="🌲"
              label="Trees equivalent"
              value={((stats?.co2SavedKg || 0) / 21).toFixed(1)}
              unit="trees/year"
            />
            <View style={styles.impactDivider} />
            <ImpactRow
              icon="🚗"
              label="Car miles avoided"
              value={((stats?.co2SavedKg || 0) * 2.5).toFixed(0)}
              unit="miles"
            />
            <View style={styles.impactDivider} />
            <ImpactRow
              icon="🗑️"
              label="Waste prevented"
              value={((stats?.wastePreventedKg || 0)).toFixed(1)}
              unit="kg"
            />
          </BlurCard>
        </AnimatedCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community Impact</Text>
        <AnimatedCard index={5}>
          <BlurCard style={styles.communityCard}>
            <View style={styles.communityHeader}>
              <Text style={styles.communityName}>{communityStats?.name || 'Your Community'}</Text>
              <Text style={styles.communityMembers}>
                {communityStats?.memberCount || 0} members
              </Text>
            </View>

            <View style={styles.communityStats}>
              <View style={styles.communityStat}>
                <Text style={styles.communityStatValue}>
                  {communityStats?.totalTransactions || 0}
                </Text>
                <Text style={styles.communityStatLabel}>Total Shares</Text>
              </View>
              <View style={styles.communityStatDivider} />
              <View style={styles.communityStat}>
                <Text style={styles.communityStatValue}>
                  ${((communityStats?.totalSavedCents || 0) / 100).toFixed(0)}
                </Text>
                <Text style={styles.communityStatLabel}>Community Savings</Text>
              </View>
              <View style={styles.communityStatDivider} />
              <View style={styles.communityStat}>
                <Text style={styles.communityStatValue}>
                  {(communityStats?.totalCo2SavedKg || 0).toFixed(0)}kg
                </Text>
                <Text style={styles.communityStatLabel}>CO₂ Saved</Text>
              </View>
            </View>
          </BlurCard>
        </AnimatedCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Rank</Text>
        <AnimatedCard index={6}>
          <BlurCard style={styles.rankCard}>
            <Text style={styles.rankEmoji}>
              {stats?.totalLends >= 50 ? '🏆' :
               stats?.totalLends >= 20 ? '🥇' :
               stats?.totalLends >= 10 ? '🥈' :
               stats?.totalLends >= 5 ? '🥉' : '🌱'}
            </Text>
            <Text style={styles.rankTitle}>
              {stats?.totalLends >= 50 ? 'Sustainability Champion' :
               stats?.totalLends >= 20 ? 'Eco Warrior' :
               stats?.totalLends >= 10 ? 'Green Neighbor' :
               stats?.totalLends >= 5 ? 'Sharing Starter' : 'New Sharer'}
            </Text>
            <Text style={styles.rankDescription}>
              {stats?.totalLends >= 50
                ? 'You\'re a community legend! Your sharing has made a huge impact.'
                : stats?.totalLends >= 20
                ? 'Amazing work! You\'re helping build a sustainable community.'
                : stats?.totalLends >= 10
                ? 'Great progress! Keep sharing to level up.'
                : stats?.totalLends >= 5
                ? 'You\'re off to a great start on your sharing journey.'
                : 'Start lending to track your sustainability impact!'}
            </Text>
            {stats?.totalLends < 50 && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min((stats?.totalLends || 0) / 50 * 100, 100)}%` }
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {50 - (stats?.totalLends || 0)} more lends to Champion
                </Text>
              </View>
            )}
          </BlurCard>
        </AnimatedCard>
      </View>

      <AnimatedCard index={7}>
        <View style={styles.tipCard}>
          <Text style={styles.tipIcon}>💡</Text>
          <Text style={styles.tipText}>
            Every item shared prevents manufacturing of a new one and keeps it out of landfills.
            You're making a real difference!
          </Text>
        </View>
      </AnimatedCard>
    </ScrollView>
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
  header: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  title: {
    ...TYPOGRAPHY.largeTitle,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  statCardWrapper: {
    width: '47%',
  },
  statCard: {
    padding: SPACING.lg,
    alignItems: 'center',
    borderRadius: RADIUS.lg,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: SPACING.sm,
  },
  statValue: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
  },
  statLabel: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  statSublabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  section: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  impactCard: {
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  impactDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
    marginVertical: SPACING.md,
  },
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  impactIcon: {
    fontSize: 20,
    width: 32,
  },
  impactLabel: {
    flex: 1,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  impactValueContainer: {
    alignItems: 'flex-end',
  },
  impactValue: {
    ...TYPOGRAPHY.h3,
    color: COLORS.primary,
  },
  impactUnit: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
  },
  communityCard: {
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  communityHeader: {
    marginBottom: SPACING.lg,
  },
  communityName: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
  },
  communityMembers: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  communityStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  communityStat: {
    alignItems: 'center',
  },
  communityStatDivider: {
    width: 1,
    backgroundColor: COLORS.separator,
  },
  communityStatValue: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.primary,
  },
  communityStatLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  rankCard: {
    padding: SPACING.xl,
    alignItems: 'center',
    borderRadius: RADIUS.lg,
  },
  rankEmoji: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  rankTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  rankDescription: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    width: '100%',
    marginTop: SPACING.lg,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.separator,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xs,
  },
  progressText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  tipCard: {
    margin: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.xxl,
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  tipIcon: {
    fontSize: 24,
  },
  tipText: {
    flex: 1,
    ...TYPOGRAPHY.footnote,
    color: COLORS.text,
    lineHeight: 20,
  },
});
