import { useState, useRef } from 'react';
import { View, Text, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import HapticPressable from './HapticPressable';
import ActionSheet from './ActionSheet';
import { Ionicons } from './Icon';
import { useError } from '../context/ErrorContext';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';

export default function RequestPhotoPicker({ uri, onChange, disabled }) {
  const { showError } = useError();
  const [failed, setFailed] = useState(false);
  const [sourceVisible, setSourceVisible] = useState(false);
  const [picking, setPicking] = useState(false);
  const pickerBusy = useRef(false);
  const choosePhoto = async (camera = false) => {
    if (disabled || pickerBusy.current) return;
    pickerBusy.current = true;
    setPicking(true);
    try {
      const permission = await (camera ? ImagePicker.requestCameraPermissionsAsync() : ImagePicker.requestMediaLibraryPermissionsAsync());
      if (!permission.granted && permission.status !== 'granted') {
        showError({ message: camera ? 'Allow camera access in Settings to take a picture.' : 'Allow photo access in Settings to add a picture.' });
        return;
      }
      const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setFailed(false);
        onChange(result.assets[0].uri);
      }
    } catch {
      showError({ message: camera ? 'Couldn’t open the camera. Please try again.' : 'Couldn’t open your photos. Please try again.' });
    } finally {
      pickerBusy.current = false;
      setPicking(false);
    }
  };
  return <View style={{ marginBottom: 20, gap: 8 }}>
    {!!uri && <Image source={{ uri }} accessibilityLabel="Item request photo" resizeMode="contain"
      style={{ width: '100%', height: 180, borderRadius: RADIUS.md }} onError={() => setFailed(true)} />}
    {uri && failed && <Text accessibilityRole="alert" style={{ color: COLORS.textSecondary }}>This photo couldn’t load. Remove it and choose it again.</Text>}
    <HapticPressable accessibilityRole="button" accessibilityLabel={uri ? 'Change request photo' : 'Add request photo'}
      disabled={disabled || picking} onPress={() => setSourceVisible(true)} style={{ minHeight: 56, paddingHorizontal: 16, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled || picking ? 0.5 : 1 }}>
      <Ionicons name="image-outline" size={22} color={COLORS.primary} />
      <Text style={{ ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.primary, flex: 1 }}>{uri ? 'Change photo' : 'Add photo'}</Text>
      <Ionicons name="add" size={20} color={COLORS.primary} />
    </HapticPressable>
    {!!uri && <HapticPressable accessibilityRole="button" accessibilityLabel="Remove request photo" disabled={disabled || picking}
      onPress={() => { setFailed(false); onChange(null); }} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: COLORS.primary }}>Remove photo</Text>
    </HapticPressable>}
    <ActionSheet isVisible={sourceVisible} onClose={() => setSourceVisible(false)} title={uri ? 'Change photo' : 'Add photo'}
      actions={[
        { label: 'Take photo', testID: 'RequestPhoto.camera', icon: <Ionicons name="camera" size={28} illustrated />, onPress: () => choosePhoto(true) },
        { label: 'Choose photo', testID: 'RequestPhoto.library', icon: <Ionicons name="image" size={28} illustrated />, onPress: () => choosePhoto(false) },
      ]} />
  </View>;
}
