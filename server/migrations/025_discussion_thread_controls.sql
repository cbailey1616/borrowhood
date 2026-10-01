DO $$ BEGIN
-- Keep parent_id pointing at the root for old clients and notification links.
-- reply_to_id records the actual parent for the new nested presentation.
ALTER TABLE listing_discussions ADD COLUMN IF NOT EXISTS reply_to_id UUID
  REFERENCES listing_discussions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS discussion_reply_to_idx ON listing_discussions(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS discussion_reactions (
  discussion_id UUID NOT NULL REFERENCES listing_discussions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢','👎','🔥','🎉','👀','💯','🙏','🤔','👏','🙌','😊','✅','🤝','✨','🛋️')),
  PRIMARY KEY(discussion_id, user_id, emoji)
);
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='discussion_reactions'::regclass
    AND contype='p' AND array_length(conkey, 1)=2) THEN
    ALTER TABLE discussion_reactions DROP CONSTRAINT discussion_reactions_pkey;
    ALTER TABLE discussion_reactions ADD PRIMARY KEY(discussion_id, user_id, emoji);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='discussion_reactions'::regclass
    AND conname='discussion_reactions_emoji_check' AND pg_get_constraintdef(oid) NOT LIKE '%🔥%') THEN
    ALTER TABLE discussion_reactions DROP CONSTRAINT discussion_reactions_emoji_check;
    ALTER TABLE discussion_reactions ADD CONSTRAINT discussion_reactions_emoji_check
      CHECK (emoji IN ('👍','❤️','😂','😮','😢','👎','🔥','🎉','👀','💯','🙏','🤔','👏','🙌','😊','✅','🤝','✨','🛋️'));
  END IF;

CREATE TABLE IF NOT EXISTS discussion_votes (
  discussion_id UUID NOT NULL REFERENCES listing_discussions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY(discussion_id, user_id)
);

END $$;
