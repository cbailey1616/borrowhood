// First-party text screening runs before writes and notifications. This is a
// targeted abuse filter, not a claim that every harmful image/text is detectable.
// Member reports and administrator removal cover content that evades screening.
const rules = [
  /\b(?:child\s*(?:porn|pornography)|(?:sell|buy|trade)\s+(?:cocaine|heroin|methamphetamine)|rape\s+(?:you|her|him|them)|(?:kill|murder)\s+(?:you|yourself)|go\s+kill\s+yourself)\b/iu,
  /\b(?:n[i1!]gg(?:er|a)s?|f[a@]gg[o0]ts?|k[i1]kes?|ch[i1]nks?)\b/iu,
  /\b(?:porn(?:ography|hub)?|blowjobs?|gangbangs?|cumshots?)\b/iu,
];
export function containsProhibitedText(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '').toLowerCase();
  const compact = normalized.replace(/(?<=\p{L})[._*\-]+(?=\p{L})/gu, '');
  return rules.some(rule => rule.test(normalized) || rule.test(compact));
}
export function screenContent(fields = ['title', 'description', 'content', 'bio', 'displayName', 'name']) {
  return (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && fields.some(key => containsProhibitedText(req.body?.[key]))) {
      return res.status(422).json({ code: 'CONTENT_NOT_ALLOWED', error: 'Please remove abusive, threatening, or explicit language before posting. For help, contact chris@borrowhood.net.' });
    }
    next();
  };
}

// All aliases and parameter references come from application code.
export const unblockedSql = (author, viewer) => `NOT EXISTS (SELECT 1 FROM user_blocks safety_block
  WHERE (safety_block.user_id = ${viewer} AND safety_block.blocked_id = ${author})
     OR (safety_block.blocked_id = ${viewer} AND safety_block.user_id = ${author}))`;
