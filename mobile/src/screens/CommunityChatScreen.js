import React from 'react';
import { View, Text } from 'react-native';
import CommunityChat from '../components/CommunityChat';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY } from '../utils/config';

export default function CommunityChatScreen({ navigation, route }) {
  const { user } = useAuth();
  const id = route?.params?.communityId;
  if (!id) return <View style={{ flex: 1, padding: SPACING.lg, backgroundColor: COLORS.background }}>
    <Text style={{ ...TYPOGRAPHY.body, color: COLORS.text }}>This chat is unavailable.</Text>
  </View>;
  // Overview and Inbox use this same channel; switching accounts or channels
  // remounts its state so messages and drafts never cross those boundaries.
  return <CommunityChat key={`${user?.id}:${id}`} community={{ id }} navigation={navigation} />;
}
