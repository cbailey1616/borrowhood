import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { CardField, useConfirmSetupIntent } from '@stripe/stripe-react-native';
import HapticPressable from '../components/HapticPressable';
import { useError } from '../context/ErrorContext';
import api from '../services/api';
import { haptics } from '../utils/haptics';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function AddPaymentMethodScreen({ navigation }) {
  const { showError, showToast } = useError();
  const { confirmSetupIntent } = useConfirmSetupIntent();
  const [clientSecret, setClientSecret] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createSetupIntent();
  }, []);

  const createSetupIntent = async () => {
    try {
      const data = await api.addPaymentMethod();
      setClientSecret(data.clientSecret);
    } catch (error) {
      showError({ message: 'Unable to initialize card setup. Please try again.' });
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!clientSecret || !cardComplete) return;

    setSaving(true);
    try {
      const { error } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        haptics.error();
        showError({ message: error.message || 'Failed to save card.' });
      } else {
        haptics.success();
        showToast('Card saved successfully!', 'success');
        navigation.goBack();
      }
    } catch (error) {
      haptics.error();
      showError({ message: 'Failed to save card. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Add a Card</Text>
        <Text style={styles.subtitle}>
          Your card details are securely handled by Stripe.
        </Text>

        <View style={styles.cardFieldWrapper}>
          <CardField
            postalCodeEnabled={false}
            placeholders={{ number: '4242 4242 4242 4242' }}
            cardStyle={{
              backgroundColor: COLORS.surface,
              textColor: COLORS.text,
              placeholderColor: COLORS.gray[500],
              borderColor: COLORS.separator,
              borderWidth: 1,
              borderRadius: RADIUS.md,
              fontSize: 16,
            }}
            style={styles.cardField}
            onCardChange={(details) => {
              setCardComplete(details.complete);
            }}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <HapticPressable
          haptic="medium"
          style={[styles.saveButton, (!cardComplete || saving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!cardComplete || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save Card</Text>
          )}
        </HapticPressable>
      </View>
    </View>
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
  content: {
    flex: 1,
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  title: {
    ...TYPOGRAPHY.title3,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  cardFieldWrapper: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  cardField: {
    width: '100%',
    height: 50,
  },
  footer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
});
