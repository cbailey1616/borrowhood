import { REQUIRE_IDENTITY_VERIFICATION } from '../utils/config';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import useFormDraft from '../hooks/useFormDraft';
import DraftStatus from '../components/DraftStatus';
import SharingPicker from '../components/SharingPicker';
import { localDate, requestDatePreset, requestAudienceProblem } from '../utils/requestForm';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '../components/Icon';
import CategoryIcon from '../components/CategoryIcon';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import { COLORS, VISIBILITY_LABELS, SPACING, RADIUS, TYPOGRAPHY, ENABLE_PAID_TIERS } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import { haptics } from '../utils/haptics';
import { checkPremiumGate } from '../utils/premiumGate';

const ALL_VISIBILITIES = ['close_friends', 'neighborhood', 'town'];

const EXPIRATION_OPTIONS = [
  { value: '1d', label: '1 Day' },
  { value: '3d', label: '3 Days' },
  { value: '1w', label: '1 Week' },
  { value: 'never', label: "Doesn't Expire" },
  { value: 'custom', label: 'Custom' },
];

export default function CreateRequestScreen({ navigation, route }) {
  const { user, isGracePeriodActive } = useAuth();
  const { showError, showToast } = useError();
  const draftScope = user?.id ? `${user.id}.request.new` : null;
  const [formData, setFormData, draft] = useFormDraft(draftScope, {
    type: 'item',
    title: route?.params?.initialTitle || '',
    description: '',
    categoryId: null,
    visibility: ['close_friends'],
    neededFrom: '',
    neededUntil: '',
    expiresIn: '1w',
    customExpiry: new Date(Date.now() + 86400000).toISOString(),
  });
  const [showDetails, setShowDetails] = useState(false);
  const [rangePicker, setRangePicker] = useState(null);
  const [friends, setFriends] = useState({ loading: true, count: 0, error: false });
  const loadFriends = useCallback(async () => {
    setFriends(prev => ({ ...prev, loading: true }));
    try { const data = await api.getFriends(); setFriends({ loading: false, count: data.length, error: false }); }
    catch { setFriends({ loading: false, count: 0, error: true }); }
  }, []);
  useFocusEffect(useCallback(() => { loadFriends(); }, [loadFriends]));
  const audienceProblem = requestAudienceProblem(formData.visibility, friends);
  const [categories, setCategories] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ title: false, categoryId: false });
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const customExpiryDate = new Date(formData.customExpiry);
  const [communityId, setCommunityId] = useState(undefined); // undefined = loading, null = no community

  useFocusEffect(useCallback(() => {
    let active = true;
    api.getCommunities({ member: true }).then(communities => {
      if (active) setCommunityId(communities?.[0]?.id || null);
    }).catch(() => { if (active) setCommunityId(null); });
    return () => { active = false; };
  }, []));

  useEffect(() => {
    const fetchData = async () => {
      try {
        const cats = await api.getCategories();
        setCategories(cats || []);
      } catch (e) {
        console.log('Failed to fetch categories:', e);
      }
    };
    fetchData();
  }, []);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleSubmit = async () => {
    if (audienceProblem || !draft.ready || isSubmitting) return;
    if ((formData.expiresIn === 'custom' && customExpiryDate <= new Date()) || (formData.neededUntil && formData.neededUntil < localDate(new Date()))) {
      setShowDetails(true);
      return showError({ message: 'This draft’s dates have passed. Choose new dates before posting.' });
    }
    const errors = {
      title: !formData.title.trim(),
    };

    if (errors.title) {
      setFieldErrors(errors);
      haptics.warning();
      showError({
        type: 'validation',
        title: 'Almost There',
        message: 'A few fields still need your attention — they\'re highlighted above.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const requestData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        type: formData.type,
        categoryId: formData.categoryId,
        visibility: formData.visibility,
        townPreviewEnabled: true,
        neededFrom: formData.neededFrom ? new Date(formData.neededFrom).toISOString() : undefined,
        neededUntil: formData.neededUntil ? new Date(formData.neededUntil).toISOString() : undefined,
        communityId: communityId,
      };

      if (formData.expiresIn === 'never') {
        requestData.expiresIn = 'never';
      } else if (formData.expiresIn === 'custom') {
        requestData.expiresAt = customExpiryDate.toISOString();
      } else {
        requestData.expiresIn = formData.expiresIn;
      }

      // Check for matching listings before creating
      try {
        const { suggestions } = await api.searchListingSuggestions(requestData.title);
        if (suggestions && suggestions.length > 0) {
          haptics.success();
          navigation.replace('RequestSuggestions', {
            draftScope,
            requestData,
            requestTitle: formData.title.trim(),
            suggestions,
          });
          return;
        }
      } catch (e) {
        // Suggestions are best-effort, don't block
      }

      await api.createRequest(requestData);
      await draft.clear().catch(() => showToast('Request posted. The local draft could not be cleared.', 'info'));
      haptics.success();
      showToast('Your request has been posted!', 'success');
      navigation.goBack();
    } catch (error) {
      showError({
        message: error.message || 'Couldn\'t post your request right now. Please check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only show 'neighborhood' visibility if user is in a community
  const availableVisibilities = communityId
    ? ALL_VISIBILITIES
    : ALL_VISIBILITIES.filter(v => v !== 'neighborhood');

  // A town request advertises a need, never the requester's inventory.
  useEffect(() => {
    if (communityId === undefined || !draft.ready || draft.restored) return;
    updateField('visibility', user?.city?.trim() && user?.state?.trim() ? ['town'] : communityId ? ['neighborhood'] : ['close_friends']);
  }, [communityId, draft.ready, draft.restored, user?.city, user?.state]);

  // Loading state while checking community
  if (communityId === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
    >
      {/* Neighborhood hint when user has no community */}
      <DraftStatus draft={draft} allowDiscard />
      {showDetails && communityId === null && (
        <HapticPressable
          style={styles.communityHint}
          onPress={() => navigation.navigate('JoinCommunity', { fromPosting: true })}
          haptic="light"
        >
          <Ionicons name="home-outline" size={18} color={COLORS.primary} />
          <Text style={styles.communityHintText}>
            Join a neighborhood to reach more people nearby
          </Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </HapticPressable>
      )}

      {/* Type Toggle */}
      <View style={styles.section}>
        <Text style={styles.label}>What do you need?</Text>
        <View style={styles.options}>
          {[
            { value: 'item', label: 'Item', icon: 'cube-outline' },
            { value: 'service', label: 'Service', icon: 'construct-outline' },
          ].map((opt) => {
            const isSelected = formData.type === opt.value;
            return (
              <HapticPressable
                key={opt.value}
                style={[styles.typeChoice, isSelected && styles.typeChoiceSelected]}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                onPress={() => updateField('type', opt.value)}
                haptic="light"
              >
                <Ionicons
                  name={opt.icon}
                  size={36}
                  color={COLORS.primary}
                  illustrated
                />
                <Text style={styles.typeTitle}>
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
          {formData.type === 'service' ? 'What do you need help with? *' : 'What would you like to borrow? *'}
        </Text>
        <TextInput
          style={[styles.input, fieldErrors.title && styles.fieldError]}
          value={formData.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder={formData.type === 'service' ? 'e.g., Help moving a sofa, Lawn mowing' : 'e.g., Power drill, Ladder, Moving boxes'}
          placeholderTextColor={COLORS.textSecondary}
          maxLength={255}
          autoCapitalize="sentences"
          autoCorrect={true}
          spellCheck={true}
        />
      </View>

      {/* Description */}
      <HapticPressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={{ color: COLORS.primary }}>{showDetails ? 'Hide optional details' : 'Add optional details'}</Text>
      </HapticPressable>
      {showDetails && <>
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
          autoCapitalize="sentences"
          autoCorrect={true}
          spellCheck={true}
        />
      </View>

      {/* Category */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, fieldErrors.categoryId && styles.fieldErrorLabel]}>Category</Text>
          <HapticPressable
            haptic="light"
            style={[styles.dropdownButton, fieldErrors.categoryId && styles.fieldError]}
            onPress={() => { Keyboard.dismiss(); setShowCategorySheet(true); }}
          >
            {formData.categoryId ? (
              <View style={styles.dropdownSelected}>
                <CategoryIcon
                  icon={categories.find(c => c.id === formData.categoryId)?.icon || 'pricetag-outline'}
                  size={22}
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
      </>}
      <View style={styles.section}>
        <Text style={styles.label}>When do you need it?</Text>
        <View style={styles.options}>
          {[['today', 'Today'], ['weekend', 'This weekend']].map(([key, label]) => <HapticPressable key={key} style={styles.option} onPress={() => setFormData(prev => ({ ...prev, ...requestDatePreset(key) }))}><Text style={styles.optionText}>{label}</Text></HapticPressable>)}
          <HapticPressable style={styles.option} onPress={() => setRangePicker('neededFrom')}><Text style={styles.optionText}>Choose dates</Text></HapticPressable>
          <HapticPressable accessibilityRole="button" accessibilityState={{ selected: !formData.neededFrom && !formData.neededUntil }} style={[styles.option, !formData.neededFrom && !formData.neededUntil && styles.optionActive]} onPress={() => { setRangePicker(null); setFormData(prev => ({ ...prev, neededFrom: '', neededUntil: '' })); }}><Text style={[styles.optionText, !formData.neededFrom && !formData.neededUntil && styles.optionTextActive]}>Flexible</Text></HapticPressable>
        </View>

        {(rangePicker || formData.neededFrom || formData.neededUntil) ? <View style={styles.dateRow}>
          <View style={styles.dateInput}>
            <Text style={styles.dateLabel}>From</Text>
            <HapticPressable accessibilityRole="button" accessibilityLabel="Choose needed from date" style={styles.input} onPress={() => setRangePicker('neededFrom')}><Text style={{ color: COLORS.text }}>{formData.neededFrom ? new Date(`${formData.neededFrom}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Any day'}</Text></HapticPressable>
          </View>
          <View style={styles.dateInput}>
            <Text style={styles.dateLabel}>Until</Text>
            <HapticPressable accessibilityRole="button" accessibilityLabel="Choose needed until date" style={styles.input} onPress={() => setRangePicker('neededUntil')}><Text style={{ color: COLORS.text }}>{formData.neededUntil ? new Date(`${formData.neededUntil}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Flexible'}</Text></HapticPressable>
          </View>
        </View> : null}
        {rangePicker && <View style={styles.datePickerCard}><DateTimePicker
          value={formData[rangePicker] ? new Date(`${formData[rangePicker]}T12:00:00`) : new Date()}
          minimumDate={rangePicker === 'neededUntil' && formData.neededFrom ? new Date(`${formData.neededFrom}T00:00:00`) : new Date()}
          mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant="light"
          textColor={COLORS.text}
          accentColor={COLORS.primary}
          style={styles.datePicker}
          onChange={(event, date) => {
            if (date) setFormData(prev => ({ ...prev, [rangePicker]: localDate(date), ...(rangePicker === 'neededFrom' && prev.neededUntil && prev.neededUntil < localDate(date) ? { neededUntil: localDate(date) } : {}) }));
            if (Platform.OS !== 'ios') setRangePicker(null);
          }} />
          <HapticPressable onPress={() => setRangePicker(null)} style={styles.inlineDateDone}><Text style={styles.inlineDateDoneText}>Done</Text></HapticPressable></View>}
      </View>

      {/* Expires After */}
      <Text style={styles.hint}>{formData.expiresIn === 'never' ? 'Visible until you close it.' : formData.expiresIn === 'custom' ? `Visible until ${customExpiryDate.toLocaleDateString()}.` : `Visible for ${EXPIRATION_OPTIONS.find(opt => opt.value === formData.expiresIn)?.label.toLowerCase() || 'your chosen time'}.`} Change this in optional details.</Text>
      {showDetails &&
      <View style={styles.section}>
        <Text style={styles.label}>Expires after</Text>
        <Text style={styles.hint}>Request will be hidden from the feed after this time</Text>
        <View style={styles.options}>
          {EXPIRATION_OPTIONS.map((opt) => {
            const isSelected = formData.expiresIn === opt.value;
            return (
              <HapticPressable
                key={opt.value}
                style={[styles.option, isSelected && styles.optionActive]}
                onPress={() => {
                  updateField('expiresIn', opt.value);
                  if (opt.value === 'custom') {
                    Keyboard.dismiss();
                    setShowDatePicker(true);
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
                  {opt.label}
                </Text>
              </HapticPressable>
            );
          })}
        </View>
        {formData.expiresIn === 'custom' && (
          <View style={styles.customDateContainer}>
            <HapticPressable
              style={styles.customDateButton}
              onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}
              haptic="light"
            >
              <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
              <Text style={styles.customDateText}>
                {customExpiryDate.toLocaleDateString()}
              </Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
            </HapticPressable>
            {showDatePicker && (
              <View style={styles.datePickerCard}>
              <DateTimePicker
                value={customExpiryDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="light"
                textColor={COLORS.text}
                accentColor={COLORS.primary}
                style={styles.datePicker}
                minimumDate={new Date()}
                onChange={(event, date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (date) updateField('customExpiry', date.toISOString());
                }}
              />
            {Platform.OS === 'ios' && (
              <HapticPressable
                style={styles.inlineDateDone}
                onPress={() => setShowDatePicker(false)}
                haptic="light"
              >
                <Text style={styles.inlineDateDoneText}>Done</Text>
              </HapticPressable>
            )}
              </View>
            )}
          </View>
        )}
      </View>}

      {/* Visibility */}
      <View style={styles.section}>
        <SharingPicker request value={formData.visibility} onChange={next => updateField('visibility', next.visibility)}
          audienceProblem={audienceProblem} audienceLoading={friends.loading}
          friendsAvailable={friends.count > 0} onInviteFriends={() => navigation.navigate('Friends', { fromPosting: true })}
          onRetryAudience={friends.error ? loadFriends : undefined}
          neighborhoodAvailable={Boolean(communityId)}
          onJoinNeighborhood={() => navigation.navigate('JoinCommunity', { fromPosting: true })}
          onCreateNeighborhood={() => navigation.navigate('JoinCommunity', { create: true, fromPosting: true })} />
      </View>

      {/* Submit */}
      <HapticPressable
        testID="CreateRequest.button.submit"
        accessibilityLabel="Post request"
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting || Boolean(audienceProblem) || !draft.ready}
        accessibilityRole="button"
        accessibilityState={{ disabled: isSubmitting || Boolean(audienceProblem) || !draft.ready }}
        haptic="medium"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Post Request</Text>
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
        icon: <CategoryIcon icon={cat.icon || 'pricetag-outline'} size={28} />,
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
  typeChoice: { flexGrow: 1, flexBasis: 130, padding: SPACING.lg, gap: 6, alignItems: 'center', borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border },
  typeChoiceSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
  typeTitle: { ...TYPOGRAPHY.headline, color: COLORS.text },
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
  communityHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  communityHintText: {
    ...TYPOGRAPHY.footnote,
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
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
  customDateContainer: {
    marginTop: SPACING.md,
  },
  customDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    backgroundColor: COLORS.surface,
  },
  customDateText: {
    ...TYPOGRAPHY.body,
    flex: 1,
    color: COLORS.text,
  },
  datePickerCard: {
    marginTop: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  datePicker: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
  },
  inlineDateDone: {
    alignSelf: 'flex-end',
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    margin: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryMuted,
  },
  inlineDateDoneText: {
    ...TYPOGRAPHY.headline,
    color: COLORS.primary,
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.primary + '15',
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  infoText: {
    ...TYPOGRAPHY.footnote,
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
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
