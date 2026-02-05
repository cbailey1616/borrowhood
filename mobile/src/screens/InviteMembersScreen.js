import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '../components/Icon';
import { COLORS, SPACING, RADIUS } from '../utils/config';

export default function InviteMembersScreen({ route, navigation }) {
  const { communityId } = route.params;
  const [email, setEmail] = useState('');

  // Generate a simple invite code (in production, this would come from the API)
  const inviteCode = `BH-${communityId?.slice(0, 8).toUpperCase() || 'INVITE'}`;
  const inviteLink = `https://borrowhood.app/join/${inviteCode}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my neighborhood on Borrowhood! Use invite code: ${inviteCode}\n\nDownload the app and enter this code to join: ${inviteLink}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert('Copied!', 'Invite code copied to clipboard');
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(inviteLink);
    Alert.alert('Copied!', 'Invite link copied to clipboard');
  };

  const handleSendEmail = () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    // In production, this would call an API to send an invite email
    Alert.alert('Invite Sent!', `An invitation has been sent to ${email}`);
    setEmail('');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Share Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Share Invite</Text>
        <Text style={styles.sectionDescription}>
          Share your neighborhood with friends and family
        </Text>

        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={22} color="#fff" />
          <Text style={styles.shareButtonText}>Share Invite Link</Text>
        </TouchableOpacity>
      </View>

      {/* Invite Code Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite Code</Text>
        <Text style={styles.sectionDescription}>
          Share this code with neighbors to let them join
        </Text>

        <View style={styles.codeContainer}>
          <Text style={styles.codeText}>{inviteCode}</Text>
          <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode}>
            <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Link Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite Link</Text>

        <View style={styles.linkContainer}>
          <Text style={styles.linkText} numberOfLines={1}>{inviteLink}</Text>
          <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
            <Ionicons name="copy-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Email Invite Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Send Email Invite</Text>
        <Text style={styles.sectionDescription}>
          Enter an email address to send a direct invitation
        </Text>

        <View style={styles.emailRow}>
          <TextInput
            style={styles.emailInput}
            value={email}
            onChangeText={setEmail}
            placeholder="neighbor@email.com"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSendEmail}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tips */}
      <View style={styles.tipsSection}>
        <Ionicons name="bulb-outline" size={20} color={COLORS.warning} />
        <Text style={styles.tipsText}>
          The more neighbors in your community, the more items available to borrow!
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  section: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[800],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  sectionDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  codeText: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  copyButton: {
    padding: SPACING.sm,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  emailRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  emailInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningMuted,
    margin: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.md,
  },
  tipsText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.warning,
    lineHeight: 20,
  },
});
