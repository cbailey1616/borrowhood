import { Text } from 'react-native';
import { COLORS, TYPOGRAPHY } from '../utils/config';
export default function EndorsementSummary({ value }) {
  if (!value) return null;
  return <Text style={{ ...TYPOGRAPHY.footnote, color: COLORS.primary, marginTop: 6 }}>
    {value.count ? `${value.percent}% endorsed · ${value.count} ${value.count === 1 ? 'exchange' : 'exchanges'} rated` : 'New—no ratings yet'}
  </Text>;
}
