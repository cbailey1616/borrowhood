import { Text, View, StyleSheet } from 'react-native';

// Clean icon component using unicode symbols
const iconMap = {
  // Navigation
  'arrow-back': '‹',
  'arrow-forward': '›',
  'chevron-forward': '›',
  'chevron-back': '‹',
  'chevron-down': '⌄',
  'chevron-up': '⌃',
  'close': '×',
  'close-circle': '⊗',
  'menu': '≡',

  // Actions
  'add': '+',
  'add-circle': '+',
  'add-circle-outline': '+',
  'checkmark': '✓',
  'checkmark-circle': '✓',
  'create': '✎',
  'create-outline': '✎',
  'trash': '−',
  'trash-outline': '−',
  'refresh': '↻',
  'share': '↗',
  'share-outline': '↗',

  // UI Elements
  'eye': '○',
  'eye-off': '●',
  'search': '⌕',
  'search-outline': '⌕',
  'filter': '⋮',
  'options': '⋯',
  'ellipsis-horizontal': '⋯',
  'ellipsis-vertical': '⋮',

  // Tab bar
  'home': '⌂',
  'home-outline': '⌂',
  'list': '☰',
  'list-outline': '☰',
  'notifications': '◉',
  'notifications-outline': '○',
  'person': '●',
  'person-outline': '○',

  // Status
  'star': '★',
  'star-outline': '☆',
  'heart': '♥',
  'heart-outline': '♡',
  'bookmark': '⚑',
  'bookmark-outline': '⚐',

  // Info
  'location': '◎',
  'location-outline': '○',
  'time': '◔',
  'time-outline': '○',
  'calendar': '▦',
  'calendar-outline': '▢',
  'camera': '◐',
  'camera-outline': '○',
  'image': '▣',
  'image-outline': '▢',

  // Communication
  'chatbubble': '◖',
  'chatbubble-outline': '○',
  'call': '✆',
  'call-outline': '✆',
  'mail': '✉',
  'mail-outline': '✉',

  // Status/Alerts
  'shield-checkmark': '⬡',
  'shield-checkmark-outline': '⬡',
  'alert-circle': '!',
  'alert-circle-outline': '!',
  'information-circle': 'i',
  'information-circle-outline': 'i',
  'warning': '!',
  'help-circle': '?',
  'help-circle-outline': '?',

  // Settings
  'settings': '⚙',
  'settings-outline': '⚙',
  'log-out': '→',
  'log-out-outline': '→',

  // People/Social
  'people': '⁂',
  'people-outline': '⁂',
  'person-add': '+',
  'person-add-outline': '+',

  // Items/Objects
  'cube': '▣',
  'cube-outline': '▢',
  'card': '▭',
  'card-outline': '▯',
  'hand-right': '☞',
  'hand-right-outline': '☞',
  'hand-left': '☜',
  'hand-left-outline': '☜',

  // Chat
  'send': '➤',
  'chatbubbles': '◖◗',
  'chatbubbles-outline': '○○',
  'notifications-off': '○',
  'notifications-off-outline': '○',

  // Misc
  'swap-horizontal': '⇄',
  'checkmark-done': '✓✓',
  'alarm': '⏰',
  'checkbox': '☑',
  'sparkles': '✦',
};

export function Ionicons({ name, size = 24, color = '#FFFFFF', style }) {
  const symbol = iconMap[name] || '•';
  const isLargeSymbol = ['arrow-back', 'arrow-forward', 'chevron-forward', 'chevron-back'].includes(name);

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Text
        style={[
          styles.icon,
          {
            fontSize: isLargeSymbol ? size * 1.2 : size * 0.7,
            color,
            lineHeight: size,
          }
        ]}
      >
        {symbol}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontWeight: '300',
    textAlign: 'center',
  },
});

export default Ionicons;
