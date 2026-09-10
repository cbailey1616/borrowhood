import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { useError } from '../context/ErrorContext';
import { COLORS, RADIUS } from '../utils/config';

export default function RequestPhotoPicker({ uri, onChange, disabled }) {
  const { showError } = useError();
  const [failed, setFailed] = useState(false);
  const choosePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted && permission.status !== 'granted') {
        showError({ message: 'Allow photo access in Settings to add a picture.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setFailed(false);
        onChange(result.assets[0].uri);
      }
    } catch {
      showError({ message: 'Couldn’t open your photos. Please try again.' });
    }
  };
  return <View style={{ marginBottom: 20, gap: 8 }}>
    {!!uri && <Image source={{ uri }} accessibilityLabel="Item request photo" resizeMode="contain"
      style={{ width: '100%', height: 180, borderRadius: RADIUS.md }} onError={() => setFailed(true)} />}
    {uri && failed && <Text accessibilityRole="alert" style={{ color: COLORS.textSecondary }}>This photo couldn’t load. Remove it and choose it again.</Text>}
    <HapticPressable accessibilityRole="button" accessibilityLabel={uri ? 'Change request photo' : 'Add request photo'}
      disabled={disabled} onPress={choosePhoto} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="image-outline" size={22} color={COLORS.primary} />
      <Text style={{ color: COLORS.primary }}>{uri ? 'Change photo' : 'Add a photo (optional)'}</Text>
    </HapticPressable>
    {!!uri && <HapticPressable accessibilityRole="button" accessibilityLabel="Remove request photo" disabled={disabled}
      onPress={() => { setFailed(false); onChange(null); }} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: COLORS.primary }}>Remove photo</Text>
    </HapticPressable>}
  </View>;
}
