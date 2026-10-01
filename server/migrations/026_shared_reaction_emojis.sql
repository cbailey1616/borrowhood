-- Only expand emoji availability. Existing reactions, primary keys, and the
-- one-reaction-per-user behavior in direct/neighborhood messages stay intact.
DO $$
DECLARE
  reaction_table TEXT;
  emoji_column SMALLINT;
  old_check RECORD;
  emoji_values TEXT := '''👍'',''❤️'',''😂'',''😮'',''😢'',''🔥'',''🎉'',''👀'',''💯'',''🙏'',''🤔'',''👏'',''🙌'',''😊'',''✅'',''🤝'',''✨'',''🛋️'',''👎''';
BEGIN
  FOREACH reaction_table IN ARRAY ARRAY['message_reactions', 'community_chat_reactions'] LOOP
    IF to_regclass(reaction_table) IS NOT NULL THEN
      SELECT attnum INTO emoji_column FROM pg_attribute
        WHERE attrelid=to_regclass(reaction_table) AND attname='emoji' AND NOT attisdropped;
      -- Replace only emoji allow-list checks, never unrelated constraints.
      FOR old_check IN SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE conrelid=to_regclass(reaction_table) AND contype='c'
        AND conkey=ARRAY[emoji_column]::SMALLINT[] LOOP
        IF old_check.definition LIKE '%ANY%' AND old_check.definition NOT LIKE '%🛋%' THEN
          EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', reaction_table, old_check.conname);
        END IF;
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass(reaction_table)
        AND contype='c' AND conkey=ARRAY[emoji_column]::SMALLINT[]
        AND pg_get_constraintdef(oid) LIKE '%🛋%') THEN
        -- NOT VALID keeps any legacy custom rows untouched; the check still
        -- enforces the supported set on all new inserts and updates.
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (emoji IN (%s)) NOT VALID',
          reaction_table, reaction_table || '_emoji_check', emoji_values);
      END IF;
    END IF;
  END LOOP;
END $$;
