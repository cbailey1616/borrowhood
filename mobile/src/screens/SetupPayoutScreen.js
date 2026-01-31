import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS } from '../utils/config';

export default function SetupPayoutScreen({ navigation, route }) {
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
      Alert.alert('Error', 'Failed to load payout status');
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
      Alert.alert('Error', error.message);
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
        <View style={styles.statusCard}>
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
        </View>
      ) : (
        <View style={styles.infoCard}>
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
        </View>
      )}

      {!isComplete && (
        <TouchableOpacity
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
        </TouchableOpacity>
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
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainerSuccess: {
    backgroundColor: COLORS.primaryDark,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  statusLabel: {
    fontSize: 16,
    color: COLORS.text,
  },
  statusBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  setupButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.warning,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  securityText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  webViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webViewTitle: {
    fontSize: 16,
    fontWeight: '600',
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
