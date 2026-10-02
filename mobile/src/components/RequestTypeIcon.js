import { Ionicons } from './Icon';
import { requestPresentation } from '../utils/requestPresentation';

export default function RequestTypeIcon({ type, size = 24, illustrated = false, ...props }) {
  return <Ionicons {...props} name={requestPresentation(type).icon} size={size} illustrated={illustrated} />;
}
