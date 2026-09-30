import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureMultipleReactions } from '../../src/services/multipleReactions.js';
it.each(['message_reactions','discussion_reactions','community_chat_reactions'])('preserves and widens legacy %s reactions idempotently', async table => {
  const db = new PGlite(), subject = table === 'discussion_reactions' ? 'discussion_id' : 'message_id';
  try {
    await db.exec(`CREATE TABLE ${table}(${subject} INT,user_id INT,emoji TEXT,PRIMARY KEY(${subject},user_id));
      INSERT INTO ${table} VALUES(1,2,'👍')`);
    await ensureMultipleReactions(db,table,subject);
    await ensureMultipleReactions(db,table,subject);
    await db.query(`INSERT INTO ${table} VALUES(1,2,'❤️'),(1,3,'👍')`);
    await expect(db.query(`INSERT INTO ${table} VALUES(1,2,'👍')`)).rejects.toThrow();
    await db.query(`DELETE FROM ${table} WHERE ${subject}=1 AND user_id=2 AND emoji='👍'`);
    expect((await db.query(`SELECT user_id,emoji FROM ${table} ORDER BY user_id`)).rows).toEqual([{user_id:2,emoji:'❤️'},{user_id:3,emoji:'👍'}]);
  } finally { await db.close(); }
});
