import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../utils/config';
import { haptics } from '../utils/haptics';
import api from '../services/api';
import HapticPressable from '../components/HapticPressable';
import BlurCard from '../components/BlurCard';
import AnimatedCard from '../components/AnimatedCard';
import ActionSheet from '../components/ActionSheet';

export default function LendingCirclesScreen({ navigation }) {
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCircle, setNewCircle] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [leaveSheetVisible, setLeaveSheetVisible] = useState(false);
  const [leaveTargetId, setLeaveTargetId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadCircles();
    }, [])
  );

  const loadCircles = async () => {
    try {
      const data = await api.getCircles();
      setCircles(data);
    } catch (err) {
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCircle = async () => {
    if (!newCircle.name.trim()) {
      haptics.warning();
      return;
    }

    setCreating(true);
    try {
      await api.createCircle(newCircle);
      setShowCreateModal(false);
      setNewCircle({ name: '', description: '' });
      loadCircles();
      haptics.success();
    } catch (err) {
      haptics.error();
    } finally {
      setCreating(false);
    }
  };

  const handleJoinCircle = async (circleId) => {
    try {
      await api.joinCircle(circleId);
      loadCircles();
      haptics.success();
    } catch (err) {
      haptics.error();
    }
  };

  const handleLeaveCircle = (circleId) => {
    setLeaveTargetId(circleId);
    setLeaveSheetVisible(true);
  };

  const confirmLeaveCircle = async () => {
    if (!leaveTargetId) return;
    try {
      await api.leaveCircle(leaveTargetId);
      loadCircles();
      haptics.success();
    } catch (err) {
      haptics.error();
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const myCircles = circles.filter(c => c.isMember);
  const availableCircles = circles.filter(c => !c.isMember);

  const CircleCard = ({ circle, index }) => (
    <AnimatedCard index={index}>
      <HapticPressable
        style={styles.circleCardPressable}
        onPress={() => navigation.navigate('CircleDetail', { circleId: circle.id })}
        haptic="light"
      >
        <BlurCard style={styles.circleCard}>
          <View style={styles.circleHeader}>
            <Text style={styles.circleIcon}>⭕</Text>
            <View style={styles.circleInfo}>
              <Text style={styles.circleName}>{circle.name}</Text>
              <Text style={styles.circleMembers}>{circle.memberCount} members</Text>
            </View>
            {circle.isMember ? (
              <HapticPressable
                style={styles.leaveButton}
                onPress={() => handleLeaveCircle(circle.id)}
                haptic="warning"
              >
                <Text style={styles.leaveButtonText}>Leave</Text>
              </HapticPressable>
            ) : circle.isInvited ? (
              <HapticPressable
                style={styles.joinButton}
                onPress={() => handleJoinCircle(circle.id)}
                haptic="medium"
              >
                <Text style={styles.joinButtonText}>Join</Text>
              </HapticPressable>
            ) : null}
          </View>
          {circle.description && (
            <Text style={styles.circleDescription} numberOfLines={2}>
              {circle.description}
            </Text>
          )}
          {circle.memberAvatars?.length > 0 && (
            <View style={styles.memberAvatars}>
              {circle.memberAvatars.slice(0, 5).map((avatar, idx) => (
                <Image
                  key={idx}
                  source={{ uri: avatar || 'https://via.placeholder.com/32' }}
                  style={[styles.memberAvatar, { marginLeft: idx > 0 ? -8 : 0 }]}
                />
              ))}
              {circle.memberCount > 5 && (
                <View style={[styles.memberAvatar, styles.moreAvatar, { marginLeft: -8 }]}>
                  <Text style={styles.moreAvatarText}>+{circle.memberCount - 5}</Text>
                </View>
              )}
            </View>
          )}
        </BlurCard>
      </HapticPressable>
    </AnimatedCard>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Lending Circles</Text>
          <Text style={styles.subtitle}>
            Create trusted groups for easier sharing
          </Text>
        </View>

        {myCircles.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>My Circles</Text>
            {myCircles.map((circle, idx) => (
              <CircleCard key={circle.id} circle={circle} index={idx} />
            ))}
          </>
        )}

        {availableCircles.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Invited Circles</Text>
            {availableCircles.filter(c => c.isInvited).map((circle, idx) => (
              <CircleCard key={circle.id} circle={circle} index={idx + myCircles.length} />
            ))}
          </>
        )}

        {circles.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⭕</Text>
            <Text style={styles.emptyTitle}>No Circles Yet</Text>
            <Text style={styles.emptyText}>
              Create a lending circle to share items with a trusted group of friends or neighbors.
            </Text>
          </View>
        )}
      </ScrollView>

      <HapticPressable
        style={styles.fab}
        onPress={() => {
          setShowCreateModal(true);
          haptics.medium();
        }}
        haptic={null}
      >
        <Text style={styles.fabText}>+</Text>
      </HapticPressable>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Circle</Text>

            <Text style={styles.inputLabel}>Circle Name</Text>
            <TextInput
              style={styles.input}
              value={newCircle.name}
              onChangeText={(text) => setNewCircle(prev => ({ ...prev, name: text }))}
              placeholder="e.g., Book Club, Craft Group"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={newCircle.description}
              onChangeText={(text) => setNewCircle(prev => ({ ...prev, description: text }))}
              placeholder="What's this circle for?"
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <HapticPressable
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
                haptic="light"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </HapticPressable>
              <HapticPressable
                style={styles.createButton}
                onPress={handleCreateCircle}
                disabled={creating}
                haptic="medium"
              >
                {creating ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </HapticPressable>
            </View>
          </View>
        </View>
      </Modal>

      <ActionSheet
        isVisible={leaveSheetVisible}
        onClose={() => {
          setLeaveSheetVisible(false);
          setLeaveTargetId(null);
        }}
        title="Leave Circle"
        message="Are you sure you want to leave this circle?"
        actions={[
          {
            label: 'Leave',
            destructive: true,
            onPress: confirmLeaveCircle,
          },
        ]}
        cancelLabel="Cancel"
      />
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
  },
  header: {
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.subheadline,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  circleCardPressable: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  circleCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  circleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  circleInfo: {
    flex: 1,
  },
  circleName: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
  },
  circleMembers: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  circleDescription: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    lineHeight: 20,
  },
  memberAvatars: {
    flexDirection: 'row',
    marginTop: SPACING.md,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gray[700],
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  moreAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray[600],
  },
  moreAvatarText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.text,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  joinButtonText: {
    ...TYPOGRAPHY.button,
    fontSize: 14,
    color: COLORS.background,
  },
  leaveButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  leaveButtonText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.danger,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.lg,
    opacity: 0.5,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.footnote,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    right: SPACING.xl,
    bottom: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: COLORS.background,
    fontWeight: '300',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 20,
    color: COLORS.text,
    marginBottom: SPACING.xl,
  },
  inputLabel: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.separator,
    borderRadius: RADIUS.md,
    padding: 14,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.separator,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.text,
  },
  createButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  createButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.background,
  },
});
