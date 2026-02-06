import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function SetupPayoutScreen({ navigation, route }) {
  const { showError } = useError();
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState(null);

  useEffect(() => {
    loadConnectStatus();
  }, []);

  const loadConnectStatus = async () => {
    try {
      const status = await api.getConnectStatus();
      setConnectStatus(status);
    } catch (error) {
      showError({ message: 'Failed to load payout status' });
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPayout = async () => {
    setLoading(true);
    try {
      const { url } = await api.getConnectOnboardingLink();
      // Open in device browser instead of WebView
      await Linking.openURL(url);
      // Reload status when user returns to app
      setTimeout(() => loadConnectStatus(), 1000);
    } catch (error) {
      haptics.error();
      showError({ message: error.message || 'Something went wrong. Please try again.' });
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

  const isComplete = connectStatus?.chargesEnabled && connectStatus?.payoutsEnabled;
  const needsAction = connectStatus?.hasAccount && !isComplete;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, isComplete && styles.iconContainerSuccess]}>
          <Ionicons
            name={isComplete ? 'checkmark-circle' : 'wallet-outline'}
            size={48}
            color={isComplete ? COLORS.primary : COLORS.textSecondary}
          />
        </View>
        <Text style={styles.title}>
          {isComplete ? 'Payouts Enabled' : 'Setup Payouts'}
        </Text>
        <Text style={styles.subtitle}>
          {isComplete
            ? 'You can now receive payments when people borrow your items.'
            : 'Connect your bank account to receive payments when people borrow your items.'}
        </Text>
      </View>

      {isComplete ? (
        <BlurCard style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Account Status</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Active</Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Charges Enabled</Text>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Payouts Enabled</Text>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          </View>
        </BlurCard>
      ) : (
        <BlurCard style={styles.infoCard}>
          <Text style={styles.infoTitle}>What you'll need:</Text>
          <View style={styles.infoItem}>
            <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.infoText}>Your legal name and date of birth</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="home-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.infoText}>Your home address</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="card-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.infoText}>Bank account or debit card details</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.infoText}>Last 4 digits of SSN (for verification)</Text>
          </View>
        </BlurCard>
      )}

      {!isComplete && (
        <HapticPressable
          haptic="medium"
          style={styles.setupButton}
          onPress={handleSetupPayout}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="flash-outline" size={20} color="#fff" />
              <Text style={styles.setupButtonText}>
                {needsAction ? 'Continue Setup' : 'Get Started'}
              </Text>
            </>
          )}
        </HapticPressable>
      )}

      {needsAction && connectStatus?.requirements?.currently_due?.length > 0 && (
        <View style={styles.warningCard}>
          <Ionicons name="alert-circle-outline" size={20} color={COLORS.warning} />
          <Text style={styles.warningText}>
            Additional information is needed to complete your account setup.
          </Text>
        </View>
      )}

      <View style={styles.securityNote}>
        <Ionicons name="lock-closed-outline" size={16} color={COLORS.textSecondary} />
        <Text style={styles.securityText}>
          Powered by Stripe. Your financial information is encrypted and secure.
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
  content: {
    padding: SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  iconContainerSuccess: {
    backgroundColor: COLORS.primaryDark,
  },
  title: {
    ...TYPOGRAPHY.h1,
    fontSize: 24,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  statusCard: {
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
  },
  statusLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  statusBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  statusBadgeText: {
    ...TYPOGRAPHY.caption1,
    fontWeight: '600',
    color: '#fff',
  },
  infoCard: {
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  infoTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  infoText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    flex: 1,
  },
  setupButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  setupButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  warningText: {
    flex: 1,
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.warning,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  securityText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
  },
  webViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webViewTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
