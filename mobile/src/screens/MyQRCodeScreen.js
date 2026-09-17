import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share, Platform, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { useError } from '../context/ErrorContext';
import LayeredCard from '../components/LayeredCard';
import ShimmerImage from '../components/ShimmerImage';
import HapticPressable from '../components/HapticPressable';
import { Ionicons } from '../components/Icon';
import { createProfileLink } from '../utils/profileLinks';
import { profileQrSource } from '../utils/profileQr';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function MyQRCodeScreen() {
  const { user } = useAuth();
  const { showError } = useError();
  const { width } = useWindowDimensions();
  const [sharing, setSharing] = useState(false);
  const link = createProfileLink(user?.id);
  const code = useMemo(() => link ? profileQrSource(link) : null, [link]);
  const size = Math.min(280, Math.max(120, width - 80));
  const name = user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  const shareProfile = async () => {
    if (!link || sharing) return;
    setSharing(true);
    try {
      await Share.share(Platform.OS === 'ios'
        ? { message: 'Add me on Borrowhood.', url: link }
        : { message: `Add me on Borrowhood.\n${link}` });
    } catch {
      showError('Could not share your profile', 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <LayeredCard style={styles.card}>
      <ShimmerImage source={{ uri: user?.profilePhotoUrl }} placeholderIcon="person" style={styles.avatar} />
      <Text style={styles.name}>{name}</Text>
      {code ? <>
        <Image testID="MyQRCode.code" source={code} style={{ width: size, height: size }}
          contentFit="contain" transition={0} accessible accessibilityRole="image"
          accessibilityLabel="Your personal QR code. Scan to open your Borrowhood profile."
          accessibilityHint="You can also use Share profile below." />
        <Text style={styles.caption}>Scan to add me on Borrowhood.</Text>
      </> : <Text style={styles.caption}>Couldn't load your code. Please reopen this screen.</Text>}
    </LayeredCard>
    <HapticPressable style={styles.shareButton} onPress={shareProfile} disabled={!link || sharing}
      accessibilityLabel="Share profile">
      <Ionicons name="share-outline" size={22} color={COLORS.surface} />
      <Text style={styles.shareText}>{sharing ? 'Opening…' : 'Share profile'}</Text>
    </HapticPressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.lg, width: '100%', maxWidth: 420, alignSelf: 'center' },
  card: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.lg },
  avatar: { width: 64, height: 64, borderRadius: RADIUS.full },
  name: { ...TYPOGRAPHY.h2, color: COLORS.text, textAlign: 'center' },
  caption: { ...TYPOGRAPHY.subheadline, color: COLORS.textSecondary, textAlign: 'center' },
  shareButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg },
  shareText: { ...TYPOGRAPHY.button, color: COLORS.surface },
});
