import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../utils/config';
import api from '../services/api';

export default function LendingCirclesScreen({ navigation }) {
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCircle, setNewCircle] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

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
      Alert.alert('Error', 'Failed to load circles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCircle = async () => {
    if (!newCircle.name.trim()) {
      Alert.alert('Error', 'Circle name is required');
      return;
    }

    setCreating(true);
    try {
      await api.createCircle(newCircle);
      setShowCreateModal(false);
      setNewCircle({ name: '', description: '' });
      loadCircles();
      Alert.alert('Success', 'Circle created!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create circle');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinCircle = async (circleId) => {
    try {
      await api.joinCircle(circleId);
      loadCircles();
      Alert.alert('Success', 'You joined the circle!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to join circle');
    }
  };

  const handleLeaveCircle = async (circleId) => {
    Alert.alert(
      'Leave Circle',
      'Are you sure you want to leave this circle?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.leaveCircle(circleId);
              loadCircles();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to leave circle');
            }
          },
        },
      ]
    );
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

  const CircleCard = ({ circle }) => (
    <TouchableOpacity
      style={styles.circleCard}
      onPress={() => navigation.navigate('CircleDetail', { circleId: circle.id })}
    >
      <View style={styles.circleHeader}>
        <Text style={styles.circleIcon}>⭕</Text>
        <View style={styles.circleInfo}>
          <Text style={styles.circleName}>{circle.name}</Text>
          <Text style={styles.circleMembers}>{circle.memberCount} members</Text>
        </View>
        {circle.isMember ? (
          <TouchableOpacity
            style={styles.leaveButton}
            onPress={() => handleLeaveCircle(circle.id)}
          >
            <Text style={styles.leaveButtonText}>Leave</Text>
          </TouchableOpacity>
        ) : circle.isInvited ? (
          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => handleJoinCircle(circle.id)}
          >
            <Text style={styles.joinButtonText}>Join</Text>
          </TouchableOpacity>
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
    </TouchableOpacity>
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
            {myCircles.map(circle => (
              <CircleCard key={circle.id} circle={circle} />
            ))}
          </>
        )}

        {availableCircles.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Invited Circles</Text>
            {availableCircles.filter(c => c.isInvited).map(circle => (
              <CircleCard key={circle.id} circle={circle} />
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

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

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
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateCircle}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  circleCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[800],
  },
  circleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  circleInfo: {
    flex: 1,
  },
  circleName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  circleMembers: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  circleDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
    lineHeight: 20,
  },
  memberAvatars: {
    flexDirection: 'row',
    marginTop: 12,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text,
  },
  joinButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.background,
  },
  leaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  leaveButtonText: {
    fontSize: 14,
    color: COLORS.danger,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.gray[800],
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[700],
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  createButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
});
