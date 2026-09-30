CREATE TABLE IF NOT EXISTS discussion_reactions (
  discussion_id UUID NOT NULL REFERENCES listing_discussions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢','👎')),
  PRIMARY KEY(discussion_id, user_id, emoji)
);
