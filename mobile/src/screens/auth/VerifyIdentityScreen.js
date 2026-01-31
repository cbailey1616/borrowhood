import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { COLORS } from '../../utils/config';

export default function VerifyIdentityScreen({ navigation }) {
  const { refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleStartVerification = async () => {
    setIsLoading(true);
    try {
      const response = await api.startIdentityVerification();
      // Open Stripe Identity verification in browser
      await Linking.openURL(response.verificationUrl);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setIsLoading(true);
    try {
      const user = await refreshUser();
      if (user.isVerified) {
        Alert.alert('Verified!', 'Your identity has been verified. Welcome to Borrowhood!');
        // Navigation will happen automatically due to auth state change
      } else {
        Alert.alert('Pending', 'Your verification is still being processed. Please check back later.');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipForNow = () => {
    Alert.alert(
      'Skip Verification?',
      'You can browse items, but you won\'t be able to borrow or lend until your identity is verified.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="shield-checkmark" size={80} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>
          To keep our community safe, we verify all members with a valid government ID.
        </Text>

        <View style={styles.benefits}>
          <BenefitItem
            icon="lock-closed"
            text="Your data is encrypted and secure"
          />
          <BenefitItem
            icon="people"
            text="Build trust with your neighbors"
          />
          <BenefitItem
            icon="checkmark-circle"
            text="Required to borrow or lend items"
          />
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleStartVerification}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="card" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Verify with ID</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleCheckStatus}
            disabled={isLoading}
          >
            <Text style={styles.secondaryButtonText}>I've already verified</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkipForNow}
          >
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function BenefitItem({ icon, text }) {
  return (
    <View style={styles.benefitItem}>
      <Ionicons name={icon} size={20} color={COLORS.secondary} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.gray[900],
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray[500],
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  benefits: {
    backgroundColor: COLORS.gray[50],
    borderRadius: 16,
    padding: 20,
    gap: 16,
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 14,
    color: COLORS.gray[700],
    flex: 1,
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.gray[700],
    fontSize: 16,
    fontWeight: '500',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: COLORS.gray[400],
    fontSize: 14,
  },
});
