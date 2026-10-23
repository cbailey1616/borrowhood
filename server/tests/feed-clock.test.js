import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query } from '../src/utils/db.js';
import { loadFeedWindow } from '../src/services/feedWindows.js';

it('includes committed posts in a fresh snapshot even when the app clock is behind PostgreSQL', async () => {
  const userId = randomUUID();
  await query("INSERT INTO users(id,email,first_name,last_name) VALUES($1,$2,'Clock','Test')", [userId,`${userId}@clock.invalid`]);
  try {
    const post = (await query("INSERT INTO item_requests(user_id,title,type,visibility,status) VALUES($1,'Clock regression','item','close_friends','open') RETURNING id",[userId])).rows[0];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    for (const token of [undefined,randomUUID()]) {
      const snapshot = await loadFeedWindow(userId,token,'clock-regression',0);
      const result = await query('SELECT id FROM item_requests WHERE id=$1 AND created_at <= $2::timestamptz',[post.id,snapshot.snapshot_at]);
      expect(result.rows.map(row=>row.id)).toEqual([post.id]);
    }
  } finally {
    vi.useRealTimers();
    await query('DELETE FROM item_requests WHERE user_id=$1',[userId]);
    await query('DELETE FROM users WHERE id=$1',[userId]);
  }
});
