import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticPressable from './HapticPressable';
import ShimmerImage from './ShimmerImage';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function ConversationHeader({ navigation, person, userId }) {
  const insets = useSafeAreaInsets();
  const name = [person?.firstName, person?.lastName].filter(Boolean).join(' ') || (userId ? 'Neighbor' : 'Messages');
  const openProfile = () => {
    if (userId) navigation.navigate('UserProfile', { id: userId });
  };
  return <View style={[styles.header, { paddingTop: insets.top }]}>
    <View style={styles.row}>
      <HapticPressable accessibilityLabel="Back" style={styles.back} onPress={() => {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.replace('Main', { screen: 'Inbox' });
      }}>
        <Ionicons name="chevron-back" size={26} color={COLORS.primary} />
      </HapticPressable>
      <HapticPressable style={styles.identity} onPress={openProfile} disabled={!userId}
        accessibilityLabel={`View ${name}’s profile`} testID="Chat.profileHeader">
        <ShimmerImage source={{ uri: person?.profilePhotoUrl || null }} placeholderIcon="person" style={styles.avatar} />
        <View style={styles.nameColumn}>
          <Text style={styles.name}>{name}</Text>
          {!!userId && <Text style={styles.hint}>View profile</Text>}
        </View>
        {!!userId && <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />}
      </HapticPressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },
  row: { minHeight: 68, paddingVertical: SPACING.sm, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  back: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, opacity: 1 },
  avatar: { width: 42, height: 42, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryMuted },
  nameColumn: { flex: 1, gap: 2 },
  name: { ...TYPOGRAPHY.headline, color: COLORS.text },
  hint: { ...TYPOGRAPHY.caption1, color: COLORS.textSecondary },
});
