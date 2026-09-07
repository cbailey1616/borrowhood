import { Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from './Icon';

export default function BiometricIcon({ type, size = 24, color = '#42594C' }) {
  if (type === 'Face ID' && Platform.OS === 'ios') {
    return <SymbolView name="faceid" size={size} tintColor={color} type="monochrome"
      fallback={<Ionicons name="scan-outline" size={size} color={color} />} />;
  }
  return <Ionicons name="finger-print-outline" size={size} color={color} />;
}
