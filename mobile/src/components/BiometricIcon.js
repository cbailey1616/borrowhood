import { COLORS } from '../utils/config';
import { Ionicons } from './Icon';

export default function BiometricIcon({ type, size = 24, color = COLORS.primary }) {
  return <Ionicons name={type === 'Face ID' ? 'faceid' : 'finger-print-outline'} size={size} color={color} />;
}
