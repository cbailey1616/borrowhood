import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '../components/Icon';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import HapticPressable from '../components/HapticPressable';
import ShimmerImage from '../components/ShimmerImage';
import { haptics } from '../utils/haptics';
import { useError } from '../context/ErrorContext';
import api from '../services/api';

const RequestSuggestionsScreen = ({ navigation, route }) => {
  const { requestData, requestTitle, suggestions } = route.params;
  const { showToast, showError } = useError();
  const [isPosting, setIsPosting] = useState(false);

  const handleSkip = async () => {
    setIsPosting(true);
    try {
      await api.createRequest(requestData);
      haptics.success();
      showToast('Your request has been posted!', 'success');
      navigation.popToTop();
    } catch (error) {
      showError({ message: error.message || 'Failed to post request' });
      setIsPosting(false);
    }
  };

  const handleListingPress = (listing) => {
    navigation.navigate('ListingDetail', { id: listing.id });
  };

  const renderSuggestion = ({ item }) => {
    const isGiveaway = item.listingType === 'giveaway';
    const userName = `${item.user.firstName} ${item.user.lastName ? `${item.user.lastName.charAt(0)}.` : ''}`;

    return (
      <HapticPressable
        haptic="light"
        scaleDown={0.98}
        onPress={() => handleListingPress(item)}
        style={styles.card}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardThumb}>
            {item.photoUrl ? (
              <ShimmerImage source={{ uri: item.photoUrl }} style={styles.cardThumbImage} />
            ) : (
              <View style={styles.cardThumbPlaceholder}>
                <Ionicons name="image-outline" size={24} color={COLORS.textMuted} />
              </View>
            )}
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTopRow}>
              <View style={[styles.pill, { backgroundColor: isGiveaway ? '#A03030' : COLORS.primary }]}>
                <Ionicons name={isGiveaway ? 'gift' : 'swap-horizontal'} size={10} color="#fff" />
                <Text style={styles.pillText}>{isGiveaway ? 'GIVEAWAY' : 'BORROW'}</Text>
              </View>
              {!isGiveaway && (
                <View style={[styles.pill, { backgroundColor: COLORS.primary }]}>
                  <Text style={styles.pillText}>
                    {item.isFree ? 'Free' : `$${item.pricePerDay}/day`}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            {item.description ? (
              <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterText}>{userName}</Text>
              {!item.isAvailable && (
                <Text style={styles.unavailableText}>Currently borrowed</Text>
              )}
            </View>
          </View>
        </View>
      </HapticPressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="bulb" size={28} color={COLORS.warning} />
        </View>
        <Text style={styles.heading}>We found some matches!</Text>
        <Text style={styles.subheading}>
          These listings might be what you're looking for "{requestTitle}"
        </Text>
      </View>

      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        renderItem={renderSuggestion}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <HapticPressable
          haptic="light"
          onPress={handleSkip}
          disabled={isPosting}
          style={[styles.skipButton, isPosting && { opacity: 0.6 }]}
        >
          {isPosting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.skipText}>None of these — post my request</Text>
          )}
        </HapticPressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxl + SPACING.lg,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  heading: {
    ...TYPOGRAPHY.title2,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subheading: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.separator,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
  },
  cardThumb: {
    width: 90,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbImage: {
    width: '100%',
    height: '100%',
  },
  cardThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    padding: SPACING.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  pillText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  cardTitle: {
    ...TYPOGRAPHY.headline,
    color: COLORS.text,
    marginBottom: 2,
  },
  cardDesc: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFooterText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  unavailableText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.warning,
  },
  footer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  skipButton: {
    backgroundColor: COLORS.greenBg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  skipText: {
    ...TYPOGRAPHY.body,
    color: '#fff',
    fontWeight: '600',
  },
});

export default RequestSuggestionsScreen;
