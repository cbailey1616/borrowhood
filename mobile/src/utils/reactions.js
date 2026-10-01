// One catalog for comments, direct messages, and neighborhood chat. Keep the
// original six keys/labels and API emoji values stable for older reactions.
export const REACTION_OPTIONS = [
  { key: 'thumbsup', emoji: '👍', label: 'Like' },
  { key: 'heart', emoji: '❤️', label: 'Love' },
  { key: 'laugh', emoji: '😂', label: 'Laugh' },
  { key: 'surprised', emoji: '😮', label: 'Surprised' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'celebrate', emoji: '🎉', label: 'Celebrate' },
  { key: 'eyes', emoji: '👀', label: 'Eyes' },
  { key: 'hundred', emoji: '💯', label: 'Hundred percent' },
  { key: 'thanks', emoji: '🙏', label: 'Thank you' },
  { key: 'thinking', emoji: '🤔', label: 'Thinking' },
  { key: 'applause', emoji: '👏', label: 'Applause' },
  { key: 'raised-hands', emoji: '🙌', label: 'Raised hands' },
  { key: 'smile', emoji: '😊', label: 'Smile' },
  { key: 'check', emoji: '✅', label: 'Check' },
  { key: 'handshake', emoji: '🤝', label: 'Handshake' },
  { key: 'sparkles', emoji: '✨', label: 'Sparkles' },
  { key: 'sofa', emoji: '🛋️', label: 'Sofa' },
  { key: 'thumbsdown', emoji: '👎', label: 'Dislike' },
];

const withoutVariationSelector = value => String(value || '').replace(/\uFE0F/g, '');
export const reactionOption = emoji => REACTION_OPTIONS.find(option =>
  withoutVariationSelector(option.emoji) === withoutVariationSelector(emoji));

// The picker and its modal use these same dimensions to avoid clipping on iPhone.
export const REACTION_PICKER_COLUMNS = 6;
export const REACTION_PICKER_CELL_HEIGHT = 44;
export const REACTION_PICKER_PADDING = 12;
export const reactionPickerHeight = (count = REACTION_OPTIONS.length, withMore = false) =>
  Math.ceil(count / REACTION_PICKER_COLUMNS) * REACTION_PICKER_CELL_HEIGHT
    + (withMore ? REACTION_PICKER_CELL_HEIGHT : 0) + REACTION_PICKER_PADDING * 2 + 2;
