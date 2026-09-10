import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { listingAvailabilitySql } from '../../src/utils/listingAvailability.js';

it('distinguishes inventory states from accepted and collected exchanges without exposing people', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE listings(id TEXT, status TEXT, listing_type TEXT, is_available BOOLEAN);
      CREATE TABLE borrow_transactions(listing_id TEXT, status TEXT);
      INSERT INTO listings VALUES ('free','active','lend',true), ('pending','active','lend',true),
        ('reserved','active','lend',false), ('borrowed','active','lend',false), ('paused','paused','lend',true),
        ('sold','given_away','sell',false), ('given','given_away','giveaway',false), ('unknown','active','lend',false);
      INSERT INTO borrow_transactions VALUES ('pending','pending'), ('reserved','paid'), ('borrowed','picked_up');`);
    const result = await db.query(`SELECT l.id, ${listingAvailabilitySql()} as state FROM listings l`);
    expect(Object.fromEntries(result.rows.map(row => [row.id, row.state]))).toEqual({ free:'available', pending:'available', reserved:'reserved', borrowed:'borrowed', paused:'paused', sold:'sold', given:'given_away', unknown:'unavailable' });
  } finally { await db.close(); }
}, 15000);
