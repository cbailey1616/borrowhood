import { Ionicons } from './Icon';

export default function BiometricIcon({ type, size = 24, color = '#42594C' }) {
  return <Ionicons name={type === 'Face ID' ? 'faceid' : 'finger-print-outline'} size={size} color={color} />;
}
