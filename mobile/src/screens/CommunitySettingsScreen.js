import TextInput from '../components/AppTextInput';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../components/Icon';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ActionSheet from '../components/ActionSheet';
import ActionButton from '../components/ActionButton';
import CoverPhotoCropper from '../components/CoverPhotoCropper';
import { COVER_ASPECT } from '../utils/coverCrop';
import { haptics } from '../utils/haptics';
import { useError } from '../context/ErrorContext';

import useNavigationTask from '../hooks/useNavigationTask';

export default function CommunitySettingsScreen({ route, navigation }) {
  const { id } = route.params;
  const { user } = useAuth();
  const startNavigationTask = useNavigationTask(navigation, `${user?.id}:${id}`);
  const { showError, showToast } = useError();
  const [community, setCommunity] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLeaveSheet, setShowLeaveSheet] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAnnouncement, setEditAnnouncement] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState(null);
  const [selectedBannerPhoto, setSelectedBannerPhoto] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [cropPhoto, setCropPhoto] = useState(null);
  const pickerBusy = useRef(false);

  const canEdit = community?.role === 'organizer' || user?.isAdmin;
  const canManageMembers = community?.role === 'organizer';

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setSelectedBannerPhoto(null);
    setCropPhoto(null);
    setShowPhotoSheet(false);
    api.getCommunity(id).then(data => {
      if (!active) return;
      setCommunity(data);
      setEditName(data.name || '');
      setEditDescription(data.description || '');
      setEditAnnouncement(data.announcement || '');
      setEditBannerUrl(data.bannerUrl || null);
      setIsEditing(!!route.params?.editCover && (data.role === 'organizer' || user?.isAdmin));
    }).catch(error => {
      console.error('Failed to fetch community:', error);
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [id, user?.id, user?.isAdmin, route.params?.editCover]);

  useEffect(() => { setCoverFailed(false); }, [selectedBannerPhoto, editBannerUrl]);

  const handleSave = async () => {
    const isCurrent = startNavigationTask();
    if (!canEdit || isSaving || pickerBusy.current) return;
    if (!editName.trim()) {
      haptics.warning();
      showError({ type: 'validation', title: 'Name Required', message: 'Neighborhood name cannot be empty.' });
      return;
    }

    setIsSaving(true);
    try {
      // Upload banner if a new photo was selected
      let bannerUrl = editBannerUrl;
      if (selectedBannerPhoto) {
        const urls = await api.uploadImages([selectedBannerPhoto], 'communities');
        if (!urls?.[0]) throw new Error('Could not upload the cover photo. Please try again.');
        bannerUrl = urls[0];
      }

      if (!isCurrent()) return;
      const coverChanged = !!selectedBannerPhoto || editBannerUrl !== (community?.bannerUrl || null);
      const saved = await api.updateCommunity(id, {
        name: editName.trim(),
        description: editDescription.trim(),
        ...(coverChanged ? { bannerUrl: bannerUrl || null } : {}),
        ...(editAnnouncement.trim() !== (community?.announcement || '').trim() ? { announcement: editAnnouncement.trim() } : {}),
      });
      if (!isCurrent()) return;
      // The saved response supplies a fresh display URL for private storage.
      const savedCover = saved?.bannerUrl === undefined ? bannerUrl : saved.bannerUrl;
      setCommunity(prev => ({
        ...prev,
        name: editName.trim(),
        description: editDescription.trim(),
        bannerUrl: savedCover || null,
        announcement: editAnnouncement.trim() || null,
      }));
      setEditBannerUrl(savedCover || null);
      setSelectedBannerPhoto(null);
      setIsEditing(false);
      haptics.success();
      showToast('Neighborhood updated', 'success');
      if (route.params?.editCover && isCurrent()) navigation.goBack();
    } catch (err) {
      haptics.error();
      showError({ type: 'generic', message: err.message || 'Failed to save changes' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(community?.name || '');
    setEditDescription(community?.description || '');
    setEditAnnouncement(community?.announcement || '');
    setEditBannerUrl(community?.bannerUrl || null);
    setSelectedBannerPhoto(null);
    setIsEditing(false);
    if (route.params?.editCover) navigation.goBack();
  };

  const handlePickBanner = async (camera = false) => {
    if (!canEdit || isSaving || pickerBusy.current) return;
    const isCurrent = startNavigationTask();
    pickerBusy.current = true;
    setIsPickingPhoto(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!isCurrent()) return;
        if (!permission.granted && permission.status !== 'granted') {
          showError({ type: 'permission', title: 'Camera access needed',
            message: 'Allow camera access in Settings to take a cover photo.',
            primaryAction: 'Open Settings', secondaryAction: 'Cancel',
            onPrimaryPress: () => Linking.openSettings().catch(() => showError({ message: 'Open your device Settings to allow camera access.' })),
          });
          return;
        }
      }
      const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({
        mediaTypes: ['images'],
        // Keep the full image for the dedicated wide cover crop on both platforms.
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });
      if (isCurrent() && !result.canceled && result.assets?.[0]?.uri) {
        setCropPhoto(result.assets[0]);
      }
    } catch (error) {
      if (isCurrent()) showError({ type: 'generic', message: camera ? 'Could not open the camera. Please try again.' : 'Could not open your photos. Please try again.' });
    } finally {
      pickerBusy.current = false;
      setIsPickingPhoto(false);
    }
  };

  const performLeaveCommunity = async () => {
    const isCurrent = startNavigationTask();
    try {
      await api.leaveCommunity(id);
      haptics.success();
      if (isCurrent()) navigation.navigate('Main');
    } catch (error) {
      haptics.error();
      const msg = error.message || 'Failed to leave neighborhood';
      showError({ message: msg.includes('active listings')
        ? 'Please delete or pause your listings in this neighborhood first.'
        : msg });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Neighborhood Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Neighborhood</Text>

        {isEditing ? (
          <View style={[styles.cardBox, styles.editCardContent]}>
            {/* Banner Photo */}
            <Text style={styles.fieldLabel}>Cover Photo</Text>
            {(selectedBannerPhoto || editBannerUrl) ? (
              <View style={styles.bannerPreviewContainer}>
                {coverFailed ? <View style={[styles.bannerPreview, styles.coverFallback]}>
                  <Ionicons name="image-outline" size={28} color={COLORS.primary} />
                  <Text style={styles.bannerPickerText}>Cover couldn’t load</Text>
                </View> : <Image
                  source={{ uri: selectedBannerPhoto || editBannerUrl }}
                  style={styles.bannerPreview}
                  resizeMode="cover"
                  accessibilityLabel="Cover photo preview"
                  onError={() => setCoverFailed(true)}
                />}
              </View>
            ) : (
              <HapticPressable style={styles.bannerPickerButton} onPress={() => setShowPhotoSheet(true)} haptic="light" disabled={isSaving || isPickingPhoto} accessibilityRole="button">
                <Ionicons name="image-outline" size={24} color={COLORS.primary} />
                <Text style={styles.bannerPickerText}>Add cover photo</Text>
              </HapticPressable>
            )}

            {(selectedBannerPhoto || editBannerUrl) && (
              <View style={{ gap: SPACING.sm, marginBottom: SPACING.md }}>
                <ActionButton label="Change cover photo" onPress={() => setShowPhotoSheet(true)} disabled={isSaving || isPickingPhoto} />
                <ActionButton label="Remove cover photo" destructive disabled={isSaving || isPickingPhoto}
                  onPress={() => { setSelectedBannerPhoto(null); setEditBannerUrl(null); haptics.light(); }} />
              </View>
            )}

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Neighborhood name"
              placeholderTextColor={COLORS.textMuted}
              maxLength={255}
              autoCapitalize="words"
              autoCorrect={true}
              spellCheck={true}
            />
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Describe your neighborhood..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              maxLength={1000}
              autoCapitalize="sentences"
              autoCorrect={true}
              spellCheck={true}
            />

            <Text style={styles.fieldLabel}>Announcement · Optional</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editAnnouncement}
              onChangeText={setEditAnnouncement}
              accessibilityLabel="Neighborhood announcement"
              placeholder="Share an update with your neighbors"
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              autoCapitalize="sentences"
            />

            <View style={styles.editActions}>
              <HapticPressable style={styles.cancelButton} onPress={handleCancelEdit} haptic="light" disabled={isSaving}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </HapticPressable>
              <HapticPressable
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving || isPickingPhoto}
                haptic="medium"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </HapticPressable>
            </View>
          </View>
        ) : (
          <View style={[styles.cardBox, styles.infoCardContent]}>
            <Text style={styles.communityName}>{community?.name || 'My Neighborhood'}</Text>
            {community?.description ? (
              <Text style={styles.communityDescription}>{community.description}</Text>
            ) : canEdit ? (
              <Text style={styles.communityDescriptionEmpty}>No description yet</Text>
            ) : null}
            {canEdit && (
              <HapticPressable style={styles.editButton} onPress={() => setIsEditing(true)} haptic="light">
                <Ionicons name="pencil" size={15} color={COLORS.primary} />
                <Text style={styles.editButtonText}>Edit Details</Text>
              </HapticPressable>
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your preferences</Text>
        <HapticPressable style={styles.actionButton} onPress={() => navigation.navigate('NotificationSettings')}>
          <Ionicons name="notifications-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Notification settings</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </HapticPressable>
        <Text style={styles.settingDescription}>Choose which updates you receive across Borrowhood.</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your sharing choices</Text>
        <Text style={styles.settingDescription}>Choose the audience for each item when you post or edit it. Items you keep private stay in your inventory.</Text>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Neighbors</Text>

        <HapticPressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('CommunityMembers', { id, role: community?.role })}
          haptic="light"
        >
          <Ionicons name={canManageMembers ? 'shield-checkmark-outline' : 'people-outline'} size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>{canManageMembers ? 'Manage Members' : 'View All Members'}</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </HapticPressable>

        <HapticPressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('InviteMembers', { communityId: id })}
          haptic="light"
        >
          <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Invite Neighbors</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray[600]} />
        </HapticPressable>
      </View>

      {/* Leave */}
      <View style={styles.section}>
        <HapticPressable
          style={[styles.actionButton, styles.leaveButton]}
          onPress={() => setShowLeaveSheet(true)}
          haptic="medium"
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={[styles.actionButtonText, styles.leaveText]}>Leave Neighborhood</Text>
        </HapticPressable>
      </View>

      <View style={styles.bottomPadding} />

      {cropPhoto && <CoverPhotoCropper key={`${user?.id}:${id}:${cropPhoto.uri}`} photo={cropPhoto}
        onCancel={() => setCropPhoto(null)}
        onComplete={uri => { setSelectedBannerPhoto(uri); setCropPhoto(null); haptics.light(); }} />}

      <ActionSheet isVisible={showPhotoSheet} onClose={() => setShowPhotoSheet(false)} title="Cover photo"
        actions={[
          { label: 'Take photo', icon: <Ionicons name="camera" size={28} illustrated />, onPress: () => handlePickBanner(true) },
          { label: 'Choose photo', icon: <Ionicons name="image" size={28} illustrated />, onPress: () => handlePickBanner(false) },
        ]} />

      <ActionSheet
        isVisible={showLeaveSheet}
        onClose={() => setShowLeaveSheet(false)}
        title="Leave Neighborhood"
        message={`Are you sure you want to leave ${community?.name}? You'll lose access to neighborhood items and members.`}
        actions={[
          {
            label: 'Leave',
            destructive: true,
            onPress: performLeaveCommunity,
          },
        ]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  coverFallback: { justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: COLORS.primaryMuted },
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
  section: {
    padding: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  sectionTitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  infoCardContent: {
    padding: SPACING.lg,
  },
  editCardContent: {
    padding: SPACING.lg,
  },
  communityName: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
  },
  communityDescription: {
    ...TYPOGRAPHY.footnote,
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: SPACING.md,
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderGreen,
  },
  editButtonText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '400',
  },
  communityDescriptionEmpty: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  fieldLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '400',
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderBrown,
    backgroundColor: COLORS.surface,
  },
  cancelButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.textSecondary,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    ...TYPOGRAPHY.button,
    color: '#fff',
  },
  settingCard: {
    marginBottom: SPACING.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  settingInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  settingLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '400',
    color: COLORS.text,
  },
  settingDescription: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  actionButtonText: {
    ...TYPOGRAPHY.body,
    flex: 1,
    color: COLORS.text,
  },
  leaveButton: {
    backgroundColor: COLORS.danger + '10',
    borderColor: COLORS.danger + '30',
  },
  leaveText: {
    color: COLORS.danger,
  },
  cardBox: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.borderBrown,
  },
  bannerPreviewContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  bannerPreview: {
    width: '100%',
    aspectRatio: COVER_ASPECT,
    borderRadius: RADIUS.md,
  },
  bannerPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  bannerPickerText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '400',
  },
  announcementFieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearAnnouncementText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    fontWeight: '400',
  },
  bottomPadding: {
    height: 40,
  },
});
