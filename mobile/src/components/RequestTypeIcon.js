import { Ionicons } from './Icon';
import { requestPresentation } from '../utils/requestPresentation';

export default function RequestTypeIcon({ type, size = 24, illustrated = true, ...props }) {
  return <Ionicons {...props} name={requestPresentation(type).icon} size={size} illustrated={illustrated} />;
}
