-- Merge duplicate conversations between the same user pairs.
-- Keep the earliest conversation, move messages from duplicates, then delete dupes.

DO $$
DECLARE
  pair RECORD;
  keeper_id UUID;
  dupe RECORD;
BEGIN
  -- Find user pairs with multiple conversations
  FOR pair IN
    SELECT
      LEAST(user1_id, user2_id) AS ua,
      GREATEST(user1_id, user2_id) AS ub,
      COUNT(*) AS cnt
    FROM conversations
    GROUP BY LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id)
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the oldest conversation
    SELECT id INTO keeper_id
    FROM conversations
    WHERE LEAST(user1_id, user2_id) = pair.ua
      AND GREATEST(user1_id, user2_id) = pair.ub
    ORDER BY created_at ASC
    LIMIT 1;

    -- Move messages from duplicates to keeper and delete dupes
    FOR dupe IN
      SELECT id FROM conversations
      WHERE LEAST(user1_id, user2_id) = pair.ua
        AND GREATEST(user1_id, user2_id) = pair.ub
        AND id != keeper_id
    LOOP
      UPDATE messages SET conversation_id = keeper_id WHERE conversation_id = dupe.id;
      DELETE FROM message_reactions WHERE message_id IN (
        SELECT id FROM messages WHERE conversation_id = dupe.id
      );
      DELETE FROM conversations WHERE id = dupe.id;
    END LOOP;

    RAISE NOTICE 'Merged % conversations for users % <-> % into %', pair.cnt, pair.ua, pair.ub, keeper_id;
  END LOOP;
END $$;

-- Add unique constraint to prevent future duplicates
-- Normalize so the smaller UUID is always user1_id
CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_pair_unique
  ON conversations (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));
