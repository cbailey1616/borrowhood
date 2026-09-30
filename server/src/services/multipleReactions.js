// Internal table names only; preserve existing reactions while widening uniqueness.
export async function ensureMultipleReactions(db, table, subject) {
  if (!['message_reactions','discussion_reactions','community_chat_reactions'].includes(table)
    || !['message_id','discussion_id'].includes(subject)) throw new Error('Invalid reaction table');
  await db.query(`DO $$ DECLARE legacy RECORD; BEGIN
    PERFORM pg_advisory_xact_lock(812780);
    FOR legacy IN SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid='${table}'::regclass AND c.contype IN ('p','u')
        AND array_length(c.conkey,1)=2
        AND (SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='${subject}')=ANY(c.conkey)
        AND (SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='user_id')=ANY(c.conkey)
    LOOP EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I',legacy.conname); END LOOP;
    CREATE UNIQUE INDEX IF NOT EXISTS ${table}_per_emoji ON ${table}(${subject},user_id,emoji);
  END $$`);
}
