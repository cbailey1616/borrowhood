import { readFile } from 'node:fs/promises';
import { query } from '../utils/db.js';

// Same wire values as mobile/src/utils/reactions.js. Tests check catalog parity.
export const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','🔥','🎉','👀','💯','🙏','🤔','👏','🙌','😊','✅','🤝','✨','🛋️','👎'];

export async function ensureReactionEmojiSchema(db = { query }) {
  await db.query(await readFile(new URL('../../migrations/026_shared_reaction_emojis.sql', import.meta.url), 'utf8'));
}
