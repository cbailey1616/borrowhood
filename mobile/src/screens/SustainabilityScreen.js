import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { COLORS } from '../utils/config';
import api from '../services/api';

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
    } catch (err) {
      Alert.alert('Error', 'Failed to load sustainability data');
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

  const StatCard = ({ icon, value, label, sublabel }) => (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sublabel && <Text style={styles.statSublabel}>{sublabel}</Text>}
    </View>
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
          icon="🔄"
          value={stats?.totalBorrows || 0}
          label="Items Borrowed"
        />
        <StatCard
          icon="🤝"
          value={stats?.totalLends || 0}
          label="Items Lent"
        />
        <StatCard
          icon="💰"
          value={`$${(stats?.moneySavedCents / 100 || 0).toFixed(0)}`}
          label="Money Saved"
        />
        <StatCard
          icon="🌍"
          value={`${(stats?.co2SavedKg || 0).toFixed(1)}kg`}
          label="CO₂ Saved"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Environmental Impact</Text>
        <View style={styles.impactCard}>
          <ImpactRow
            icon="🌲"
            label="Trees equivalent"
            value={((stats?.co2SavedKg || 0) / 21).toFixed(1)}
            unit="trees/year"
          />
          <ImpactRow
            icon="🚗"
            label="Car miles avoided"
            value={((stats?.co2SavedKg || 0) * 2.5).toFixed(0)}
            unit="miles"
          />
          <ImpactRow
            icon="🗑️"
            label="Waste prevented"
            value={((stats?.wastePreventedKg || 0)).toFixed(1)}
            unit="kg"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community Impact</Text>
        <View style={styles.communityCard}>
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
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Rank</Text>
        <View style={styles.rankCard}>
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
        </View>
      </View>

      <View style={styles.tipCard}>
        <Text style={styles.tipIcon}>💡</Text>
        <Text style={styles.tipText}>
          Every item shared prevents manufacturing of a new one and keeps it out of landfills.
          You're making a real difference!
        </Text>
      </View>
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
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statSublabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  impactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    gap: 16,
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
    fontSize: 15,
    color: COLORS.text,
  },
  impactValueContainer: {
    alignItems: 'flex-end',
  },
  impactValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  impactUnit: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  communityCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  communityHeader: {
    marginBottom: 16,
  },
  communityName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  communityMembers: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
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
    backgroundColor: COLORS.gray[700],
  },
  communityStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  communityStatLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  rankCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  rankEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  rankTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  rankDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    width: '100%',
    marginTop: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.gray[700],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  tipCard: {
    margin: 16,
    marginTop: 24,
    marginBottom: 32,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  tipIcon: {
    fontSize: 24,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
});
