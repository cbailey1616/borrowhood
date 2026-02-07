import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Keyboard,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { useError } from '../context/ErrorContext';
import { COLORS, VISIBILITY_LABELS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import { haptics } from '../utils/haptics';

const VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function EditRequestScreen({ navigation, route }) {
  const { request } = route.params;
  const { showError, showToast } = useError();
  const [formData, setFormData] = useState({
    type: request.type || 'item',
    title: request.title || '',
    description: request.description || '',
    categoryId: request.categoryId || null,
    visibility: Array.isArray(request.visibility) ? request.visibility : [request.visibility || 'neighborhood'],
    neededFrom: formatDate(request.neededFrom),
    neededUntil: formatDate(request.neededUntil),
  });
  const [categories, setCategories] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ title: false, categoryId: false });
  const [showCategorySheet, setShowCategorySheet] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await api.getCategories();
        setCategories(cats || []);
      } catch (e) {
        console.log('Failed to fetch categories:', e);
      }
    };
    fetchCategories();
  }, []);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors(prev => ({ ...prev, [field]: false }));
    }
  };

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
    const errors = {
      title: !formData.title.trim(),
      categoryId: !formData.categoryId,
    };

    if (errors.title || errors.categoryId) {
      setFieldErrors(errors);
      haptics.warning();
      showError({
        type: 'validation',
        title: 'Missing Fields',
        message: 'Please fill in the highlighted fields.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        type: formData.type,
        categoryId: formData.categoryId,
        visibility: formData.visibility,
        neededFrom: formData.neededFrom ? new Date(formData.neededFrom).toISOString() : undefined,
        neededUntil: formData.neededUntil ? new Date(formData.neededUntil).toISOString() : undefined,
      };

      await api.updateRequest(request.id, data);

      haptics.success();
      navigation.goBack();
      setTimeout(() => showToast('Request updated!', 'success'), 500);
    } catch (error) {
      showError({
        message: error.message || 'Unable to update your request. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
    >
      {/* Type Toggle */}
      <View style={styles.section}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.options}>
          {[
            { value: 'item', label: 'Item', icon: 'cube-outline' },
            { value: 'service', label: 'Service', icon: 'construct-outline' },
          ].map((opt) => {
            const isSelected = formData.type === opt.value;
            return (
              <HapticPressable
                key={opt.value}
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => updateField('type', opt.value)}
                haptic="light"
              >
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={isSelected ? '#fff' : COLORS.textSecondary}
                  style={{ marginRight: SPACING.xs }}
                />
                <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                  {opt.label}
                </Text>
              </HapticPressable>
            );
          })}
        </View>
      </View>

      {/* Title */}
      <View style={styles.section}>
        <Text style={[styles.label, fieldErrors.title && styles.fieldErrorLabel]}>
          {formData.type === 'service' ? 'What service do you need? *' : 'What are you looking for? *'}
        </Text>
        <TextInput
          style={[styles.input, fieldErrors.title && styles.fieldError]}
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

      {/* Category */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, fieldErrors.categoryId && styles.fieldErrorLabel]}>Category *</Text>
          <HapticPressable
            haptic="light"
            style={[styles.dropdownButton, fieldErrors.categoryId && styles.fieldError]}
            onPress={() => { Keyboard.dismiss(); setShowCategorySheet(true); }}
          >
            {formData.categoryId ? (
              <View style={styles.dropdownSelected}>
                <Ionicons
                  name={categories.find(c => c.id === formData.categoryId)?.icon || 'pricetag-outline'}
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.dropdownSelectedText}>
                  {categories.find(c => c.id === formData.categoryId)?.name}
                </Text>
              </View>
            ) : (
              <Text style={styles.dropdownPlaceholder}>Select a category</Text>
            )}
            <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
          </HapticPressable>
        </View>
      )}

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
              <HapticPressable
                key={visibility}
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => {
                  const current = formData.visibility;
                  if (isSelected) {
                    if (current.length > 1) {
                      updateField('visibility', current.filter(v => v !== visibility));
                    }
                  } else {
                    updateField('visibility', [...current, visibility]);
                  }
                }}
                haptic="light"
              >
                <Ionicons
                  name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={isSelected ? "#fff" : COLORS.textSecondary}
                  style={{ marginRight: SPACING.xs + 2 }}
                />
                <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                  {VISIBILITY_LABELS[visibility]}
                </Text>
              </HapticPressable>
            );
          })}
        </View>
      </View>

      {/* Submit */}
      <HapticPressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        haptic="medium"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Save Changes</Text>
        )}
      </HapticPressable>
    </KeyboardAwareScrollView>

    {/* Category Picker */}
    <ActionSheet
      isVisible={showCategorySheet}
      onClose={() => setShowCategorySheet(false)}
      title="Select Category"
      actions={categories.map(cat => ({
        label: cat.name,
        icon: cat.icon || 'pricetag-outline',
        onPress: () => {
          updateField('categoryId', cat.id);
          haptics.selection();
        },
      }))}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.xl - 4,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  label: {
    ...TYPOGRAPHY.headline,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  hint: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    ...TYPOGRAPHY.body,
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
    gap: SPACING.md,
  },
  dateInput: {
    flex: 1,
  },
  dateLabel: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    backgroundColor: COLORS.surface,
  },
  dropdownSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dropdownSelectedText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  dropdownPlaceholder: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md - 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.separator,
  },
  optionActive: {
    backgroundColor: COLORS.primary,
  },
  optionText: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    color: '#fff',
  },
  fieldError: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  fieldErrorLabel: {
    color: COLORS.danger,
  },
});
