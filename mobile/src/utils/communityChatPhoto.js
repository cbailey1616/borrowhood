import { BASE_URL } from './config';

// The existing group endpoint carries text. A photo is shared as a readable
// photo link plus its caption, so older clients can still read the message.
const PHOTO_PREFIX = '📷 ';
export const PHOTO_CAPTION_LIMIT = 1600;
export function communityPhotoContent(url, caption = '') {
  return `${PHOTO_PREFIX}${url}${caption.trim() ? `\n${caption.trim()}` : ''}`;
}

export function communityMessageContent(content = '') {
  const [first, ...caption] = content.split('\n');
  if (!first.startsWith(PHOTO_PREFIX)) return { text: content, photoUrl: null };
  const url = first.slice(PHOTO_PREFIX.length);
  try {
    const parsed = new URL(url);
    // Only app uploads become inline photos; ordinary pasted links stay text.
    const cloudUpload = parsed.protocol === 'https:' && /\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/.test(parsed.hostname)
      && /^\/messages\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:jpe?g|png|webp|heic)$/i.test(parsed.pathname);
    const localUpload = parsed.origin === new URL(BASE_URL).origin
      && /^\/uploads\/[a-f0-9-]{36}\.(?:jpe?g|png|webp|heic)$/i.test(parsed.pathname);
    if ((cloudUpload || localUpload) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash) {
      return { text: caption.join('\n'), photoUrl: url };
    }
  } catch { /* An invalid or unsupported photo link remains readable text. */ }
  return { text: content, photoUrl: null };
}
