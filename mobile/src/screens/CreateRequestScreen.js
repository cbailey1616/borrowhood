import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { COLORS, VISIBILITY_LABELS } from '../utils/config';

const VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

export default function CreateRequestScreen({ navigation }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    visibility: 'neighborhood',
    neededFrom: '',
    neededUntil: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      Alert.alert('Error', 'Please enter a title');
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
        communityId: '00000000-0000-0000-0000-000000000001', // Would come from user's community
      });

      Alert.alert('Success', 'Your request has been posted!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
        <View style={styles.options}>
          {VISIBILITIES.map((visibility) => (
            <TouchableOpacity
              key={visibility}
              style={[styles.option, formData.visibility === visibility && styles.optionActive]}
              onPress={() => updateField('visibility', visibility)}
            >
              <Text style={[styles.optionText, formData.visibility === visibility && styles.optionTextActive]}>
                {VISIBILITY_LABELS[visibility]}
              </Text>
            </TouchableOpacity>
          ))}
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
