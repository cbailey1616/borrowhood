import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { COLORS, VISIBILITY_LABELS } from '../utils/config';

const VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

export default function CreateRequestScreen({ navigation }) {
  const { showError, showToast } = useError();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    visibility: ['neighborhood'], // Array for multi-select
    neededFrom: '',
    neededUntil: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [communityId, setCommunityId] = useState(undefined); // undefined = loading, null = no community

  useEffect(() => {
    const fetchCommunity = async () => {
      try {
        const communities = await api.getCommunities({ member: true });
        if (communities && communities.length > 0) {
          setCommunityId(communities[0].id);
        } else {
          setCommunityId(null);
        }
      } catch (err) {
        console.log('Failed to fetch communities:', err);
        setCommunityId(null);
      }
    };
    fetchCommunity();
  }, []);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Simple date input - in production, use a date picker
  const formatDateInput = (text, field) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = cleaned;
    if (cleaned.length > 4) {
      formatted = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
    }
    if (cleaned.length > 6) {
      formatted = cleaned.slice(0, 4) + '-' + cleaned.slice(4, 6) + '-' + cleaned.slice(6, 8);
    }
    updateField(field, formatted);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      showError({
        type: 'validation',
        title: 'Missing Title',
        message: 'What are you looking for? Enter a title for your request.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createRequest({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        visibility: formData.visibility,
        neededFrom: formData.neededFrom ? new Date(formData.neededFrom).toISOString() : undefined,
        neededUntil: formData.neededUntil ? new Date(formData.neededUntil).toISOString() : undefined,
        communityId: communityId,
      });

      showToast('Your request has been posted!', 'success');
      navigation.goBack();
    } catch (error) {
      showError({
        message: error.message || 'Unable to post your request. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state while checking community
  if (communityId === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Show prompt to join neighborhood if user isn't in one
  if (communityId === null) {
    return (
      <View style={styles.container}>
        <View style={styles.promptContent}>
          <View style={styles.promptCard}>
            <View style={styles.promptIconContainer}>
              <Ionicons name="home" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.promptTitle}>Join Your Neighborhood</Text>
            <Text style={styles.promptText}>
              Connect with your neighbors to request items you need. Join or create your neighborhood to get started.
            </Text>

            <View style={styles.promptBenefits}>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Request items from neighbors</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Get notified when items are available</Text>
              </View>
              <View style={styles.promptBenefit}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                <Text style={styles.promptBenefitText}>Share your own items</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.promptButton}
              onPress={() => navigation.navigate('JoinCommunity')}
            >
              <Text style={styles.promptButtonText}>Find Your Neighborhood</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.background} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.promptSecondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.promptSecondaryText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
    >
      {/* Title */}
      <View style={styles.section}>
        <Text style={styles.label}>What are you looking for? *</Text>
        <TextInput
          style={styles.input}
          value={formData.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="e.g., Power drill, Ladder, Moving boxes"
          placeholderTextColor={COLORS.textSecondary}
          maxLength={255}
        />
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.label}>Details (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder="Add more details about what you need..."
          placeholderTextColor={COLORS.textSecondary}
          multiline
          numberOfLines={4}
          maxLength={2000}
        />
      </View>

      {/* Date Range */}
      <View style={styles.section}>
        <Text style={styles.label}>When do you need it?</Text>
        <Text style={styles.hint}>Optional - helps neighbors know your timeline</Text>

        <View style={styles.dateRow}>
          <View style={styles.dateInput}>
            <Text style={styles.dateLabel}>From</Text>
            <TextInput
              style={styles.input}
              value={formData.neededFrom}
              onChangeText={(t) => formatDateInput(t, 'neededFrom')}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          <View style={styles.dateInput}>
            <Text style={styles.dateLabel}>Until</Text>
            <TextInput
              style={styles.input}
              value={formData.neededUntil}
              onChangeText={(t) => formatDateInput(t, 'neededUntil')}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
        </View>
      </View>

      {/* Visibility */}
      <View style={styles.section}>
        <Text style={styles.label}>Who can see this? *</Text>
        <Text style={styles.hint}>Select all that apply</Text>
        <View style={styles.options}>
          {VISIBILITIES.map((visibility) => {
            const isSelected = formData.visibility.includes(visibility);
            return (
              <TouchableOpacity
                key={visibility}
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => {
                  const current = formData.visibility;
                  if (isSelected) {
                    // Don't allow deselecting if it's the only one
                    if (current.length > 1) {
                      updateField('visibility', current.filter(v => v !== visibility));
                    }
                  } else {
                    updateField('visibility', [...current, visibility]);
                  }
                }}
              >
                <Ionicons
                  name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={isSelected ? "#fff" : COLORS.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                  {VISIBILITY_LABELS[visibility]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
        <Text style={styles.infoText}>
          When someone lists an item matching your request, you'll be notified automatically.
        </Text>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Post Request</Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  promptContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  promptCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  promptIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  promptTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  promptText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  promptBenefits: {
    gap: 12,
    marginBottom: 24,
  },
  promptBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promptBenefitText: {
    fontSize: 14,
    color: COLORS.text,
  },
  promptButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  promptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  promptSecondaryButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
  promptSecondaryText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray[800],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.gray[800],
  },
  optionActive: {
    backgroundColor: COLORS.primary,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.primary + '15',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
