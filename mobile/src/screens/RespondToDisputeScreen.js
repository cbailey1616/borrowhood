import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '../components/Icon';
import { useError } from '../context/ErrorContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import { haptics } from '../utils/haptics';
import * as ImagePicker from 'expo-image-picker';

const TYPE_CONFIG = {
  damagesClaim: { label: 'Damages Claim', icon: 'construct-outline' },
  nonReturn: { label: 'Non-Return', icon: 'close-circle-outline' },
  lateReturn: { label: 'Late Return', icon: 'time-outline' },
  itemNotAsDescribed: { label: 'Not As Described', icon: 'alert-circle-outline' },
  paymentIssue: { label: 'Payment Issue', icon: 'card-outline' },
  noShow: { label: 'No Show', icon: 'person-remove-outline' },
};

export default function RespondToDisputeScreen({ navigation, route }) {
  const { disputeId, claimantName, type, description } = route.params || {};

  const { showError } = useError();
  const [responseDescription, setResponseDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const typeInfo = TYPE_CONFIG[type] || { label: type, icon: 'help-circle-outline' };
  const isValid = responseDescription.length >= 10;

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4 - photos.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map(a => a.uri);
      setPhotos(prev => [...prev, ...newPhotos].slice(0, 4));
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    setSubmitting(true);
    try {
      let responsePhotoUrls = [];
      if (photos.length > 0) {
        responsePhotoUrls = await api.uploadImages(photos, 'disputes');
      }

      await api.respondToDispute(disputeId, {
        responseDescription,
        responsePhotoUrls,
      });

      setCompleted(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      showError({
        message:
          err.message ||
          "Couldn't submit your response right now. Please check your connection and try again.",
        type: 'network',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (completed) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Response Submitted</Text>
          <Text style={styles.subtitle}>
            Your response has been recorded. An organizer will review the dispute.
          </Text>
          <HapticPressable
            style={styles.primaryButton}
            onPress={() => navigation.goBack()}
            haptic="light"
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </HapticPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        {/* Claim Summary */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.typeBadge}>
              <Ionicons name={typeInfo.icon} size={20} color={COLORS.primary} />
              <Text style={styles.typeLabel}>{typeInfo.label}</Text>
            </View>
            <Text style={styles.claimantText}>Filed by {claimantName}</Text>
            <Text style={styles.claimDescription}>{description}</Text>
          </View>
        </BlurCard>

        {/* Response Description */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Your Response</Text>
            <TextInput
              testID="RespondDispute.input.description"
              accessibilityLabel="Response description"
              style={styles.responseInput}
              value={responseDescription}
              onChangeText={setResponseDescription}
              placeholder="Describe your side of the situation..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={styles.charCount}>{responseDescription.length}/2000</Text>
          </View>
        </BlurCard>

        {/* Response Photos */}
        <BlurCard style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel}>Photos</Text>
            <Text style={styles.cardHint}>Upload up to 4 photos to support your response</Text>

            <View style={styles.photosGrid}>
              {photos.map((uri, index) => (
                <View key={index} style={styles.photoWrapper}>
                  <Image source={{ uri }} style={styles.photo} />
                  <HapticPressable
                    style={styles.removePhoto}
                    onPress={() => removePhoto(index)}
                    haptic="light"
                  >
                    <Ionicons name="close-circle" size={22} color={COLORS.danger} />
                  </HapticPressable>
                </View>
              ))}

              {photos.length < 4 && (
                <HapticPressable
                  testID="RespondDispute.button.addPhoto"
                  accessibilityLabel="Add photo"
                  accessibilityRole="button"
                  style={styles.addPhotoButton}
                  onPress={pickPhotos}
                  haptic="light"
                >
                  <Ionicons name="camera-outline" size={28} color={COLORS.textSecondary} />
                  <Text style={styles.addPhotoText}>Add</Text>
                </HapticPressable>
              )}
            </View>
          </View>
        </BlurCard>

        {/* Submit */}
        <HapticPressable
          testID="RespondDispute.button.submit"
          accessibilityLabel="Submit response"
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            (!isValid || submitting) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
          haptic="medium"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Submit Response</Text>
          )}
        </HapticPressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centeredContent: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  successCircle: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  card: {
    marginBottom: SPACING.lg,
  },
  cardContent: {
    padding: SPACING.lg,
  },
  cardLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  cardHint: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  typeLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
  },
  claimantText: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  claimDescription: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  responseInput: {
    backgroundColor: COLORS.gray[800],
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    minHeight: 120,
  },
  charCount: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  photoWrapper: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removePhoto: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  addPhotoButton: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[800],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: {
    ...TYPOGRAPHY.caption2,
    color: COLORS.textSecondary,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    ...TYPOGRAPHY.button,
    fontSize: 16,
  },
});
