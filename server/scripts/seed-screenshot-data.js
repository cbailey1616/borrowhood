/**
 * Seed Screenshot Data
 * Populates the database with realistic fake data for App Store screenshots.
 * Run: node scripts/seed-screenshot-data.js
 * Cleanup: node scripts/seed-screenshot-data.js --cleanup
 */

import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://chrisbailey@localhost:5432/borrowhood' });
const query = (text, params) => pool.query(text, params);

// Tag all seeded data so we can clean it up
const SEED_TAG = 'appstore-seed';

// Unsplash photo URLs (free to use, reliable)
const PHOTOS = {
  // Indexed to match USERS array: Sarah(F), Mike(M), Emily(F), James(M), Priya(F), David(M), Lisa(F), Alex(M), Rachel(F), Tom(M)
  profiles: [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face', // 0: Sarah - blonde woman
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face', // 1: Mike - dark-haired man
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face', // 2: Emily - Asian woman
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face', // 3: James - outdoorsy man
    'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200&h=200&fit=crop&crop=face', // 4: Priya - South Asian woman
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face', // 5: David - older man
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&h=200&fit=crop&crop=face', // 6: Lisa - Asian woman
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face', // 7: Alex - young man
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face', // 8: Rachel - woman
    'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=200&h=200&fit=crop&crop=face', // 9: Tom - man
  ],
  // Per-listing photos — indexed to match LISTINGS array order
  listings: [
    // 0: DeWalt Power Drill
    'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=600&fit=crop',
    // 1: Circular Saw
    'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&h=600&fit=crop',
    // 2: Pressure Washer
    'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?w=600&h=600&fit=crop',
    // 3: KitchenAid Stand Mixer
    'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=600&h=600&fit=crop',
    // 4: Instant Pot
    'https://images.unsplash.com/photo-1585515320310-259814833e62?w=600&h=600&fit=crop',
    // 5: Waffle Maker
    'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&h=600&fit=crop',
    // 6: Lawn Mower
    'https://images.unsplash.com/photo-1590212151175-e58edd96185b?w=600&h=600&fit=crop',
    // 7: Hedge Trimmer
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=600&fit=crop',
    // 8: Garden Tiller
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=600&fit=crop',
    // 9: Canon DSLR Camera
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&h=600&fit=crop',
    // 10: Portable Projector
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=600&fit=crop',
    // 11: Drone (DJI Mini)
    'https://images.unsplash.com/photo-1507582020474-9a35b7d455d9?w=600&h=600&fit=crop',
    // 12: Mountain Bike
    'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&h=600&fit=crop',
    // 13: Kayak (2-person)
    'https://images.unsplash.com/photo-1472745433479-4556f22e32c2?w=600&h=600&fit=crop',
    // 14: Cricket Set
    'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&h=600&fit=crop',
    // 15: 4-Person Tent
    'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&h=600&fit=crop',
    // 16: Camping Stove
    'https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?w=600&h=600&fit=crop',
    // 17: Rooftop Cargo Box
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&h=600&fit=crop',
    // 18: Folding Tables
    'https://images.unsplash.com/photo-1530023367847-a683933f4172?w=600&h=600&fit=crop',
    // 19: Bluetooth PA Speaker
    'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&h=600&fit=crop',
    // 20: String Lights
    'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&h=600&fit=crop',
    // 21: Pack n Play
    'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&h=600&fit=crop',
    // 22: Kids Bike
    'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&h=600&fit=crop',
    // 23: Carpet Cleaner
    'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&h=600&fit=crop',
    // 24: Steam Mop
    'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=600&h=600&fit=crop',
  ],
};

const USERS = [
  { firstName: 'Sarah', lastName: 'Mitchell', email: 'sarah@screenshot.seed', bio: 'Mom of two, love sharing tools and kids stuff with neighbors!', city: 'Upton', state: 'MA' },
  { firstName: 'Mike', lastName: 'Rodriguez', email: 'mike@screenshot.seed', bio: 'DIY enthusiast. Happy to lend out my workshop tools.', city: 'Upton', state: 'MA' },
  { firstName: 'Emily', lastName: 'Chen', email: 'emily@screenshot.seed', bio: 'Baker and gardener. Borrow my stand mixer anytime!', city: 'Upton', state: 'MA' },
  { firstName: 'James', lastName: 'Wilson', email: 'james@screenshot.seed', bio: 'Outdoor adventure lover. Camping gear available for neighbors.', city: 'Upton', state: 'MA' },
  { firstName: 'Priya', lastName: 'Patel', email: 'priya@screenshot.seed', bio: 'Tech nerd with too many gadgets. Sharing is caring!', city: 'Upton', state: 'MA' },
  { firstName: 'David', lastName: 'Thompson', email: 'david@screenshot.seed', bio: 'Retired contractor. Full garage of tools at your service.', city: 'Upton', state: 'MA' },
  { firstName: 'Lisa', lastName: 'Nguyen', email: 'lisa@screenshot.seed', bio: 'Party planner with all the supplies you need.', city: 'Upton', state: 'MA' },
  { firstName: 'Alex', lastName: 'Cooper', email: 'alex@screenshot.seed', bio: 'Cyclist and sports enthusiast. Gear up from my collection!', city: 'Upton', state: 'MA' },
  { firstName: 'Rachel', lastName: 'Kim', email: 'rachel@screenshot.seed', bio: 'Minimalist trying to own less, share more.', city: 'Upton', state: 'MA' },
  { firstName: 'Tom', lastName: 'Garcia', email: 'tom@screenshot.seed', bio: 'Your friendly neighborhood lender. 5-star rated!', city: 'Upton', state: 'MA' },
];

const LISTINGS = [
  // Tools & Hardware
  { title: 'DeWalt Power Drill', desc: 'Cordless 20V MAX drill with two batteries and charger. Great for weekend projects.', category: 'Tools & Hardware', condition: 'good', price: 0, deposit: 0, free: true, owner: 1 },
  { title: 'Circular Saw', desc: '7-1/4" circular saw, barely used. Comes with extra blade.', category: 'Tools & Hardware', condition: 'like_new', price: 8, deposit: 40, free: false, owner: 5 },
  { title: 'Pressure Washer', desc: '3000 PSI gas pressure washer. Perfect for decks, driveways, and siding.', category: 'Tools & Hardware', condition: 'good', price: 25, deposit: 100, free: false, owner: 1 },
  // Kitchen & Cooking
  { title: 'KitchenAid Stand Mixer', desc: 'Professional 5-quart stand mixer in red. Includes dough hook, whisk, and paddle.', category: 'Kitchen & Cooking', condition: 'like_new', price: 10, deposit: 50, free: false, owner: 2 },
  { title: 'Instant Pot Duo', desc: '8-quart Instant Pot, great for big batch cooking or meal prep.', category: 'Kitchen & Cooking', condition: 'good', price: 0, deposit: 0, free: true, owner: 2 },
  { title: 'Waffle Maker', desc: 'Belgian waffle maker, makes perfect waffles every time!', category: 'Kitchen & Cooking', condition: 'good', price: 0, deposit: 0, free: true, owner: 8 },
  // Garden & Outdoor
  { title: 'Lawn Mower', desc: 'Honda self-propelled gas mower. Starts on first pull every time.', category: 'Garden & Outdoor', condition: 'good', price: 15, deposit: 75, free: false, owner: 5 },
  { title: 'Hedge Trimmer', desc: 'Electric hedge trimmer, 22" blade. Lightweight and easy to use.', category: 'Garden & Outdoor', condition: 'good', price: 5, deposit: 25, free: false, owner: 0 },
  { title: 'Garden Tiller', desc: 'Electric cultivator/tiller for garden beds. Spring is coming!', category: 'Garden & Outdoor', condition: 'fair', price: 10, deposit: 40, free: false, owner: 5 },
  // Electronics
  { title: 'Canon DSLR Camera', desc: 'Canon EOS Rebel T7 with 18-55mm lens. Perfect for events or learning photography.', category: 'Electronics & Tech', condition: 'like_new', price: 20, deposit: 200, free: false, owner: 4 },
  { title: 'Portable Projector', desc: 'Mini projector, 1080p. Great for backyard movie nights!', category: 'Electronics & Tech', condition: 'good', price: 12, deposit: 75, free: false, owner: 4 },
  { title: 'Drone (DJI Mini)', desc: 'DJI Mini 2, flies great. Includes extra battery and carry case.', category: 'Electronics & Tech', condition: 'like_new', price: 30, deposit: 150, free: false, owner: 4 },
  // Sports
  { title: 'Mountain Bike', desc: 'Trek Marlin 5, size medium. Recently tuned up with new tires.', category: 'Sports & Recreation', condition: 'good', price: 15, deposit: 100, free: false, owner: 7 },
  { title: 'Kayak (2-person)', desc: 'Tandem inflatable kayak with paddles and pump. River or lake ready.', category: 'Sports & Recreation', condition: 'good', price: 20, deposit: 75, free: false, owner: 3 },
  { title: 'Cricket Set', desc: 'Full cricket set with bat, ball, stumps, and bails. Great for backyard games.', category: 'Sports & Recreation', condition: 'good', price: 0, deposit: 0, free: true, owner: 7 },
  // Camping
  { title: '4-Person Tent', desc: 'REI Co-op Half Dome tent. Easy setup, great ventilation.', category: 'Camping & Travel', condition: 'good', price: 12, deposit: 60, free: false, owner: 3 },
  { title: 'Camping Stove', desc: 'Coleman 2-burner propane stove. Tank included.', category: 'Camping & Travel', condition: 'good', price: 0, deposit: 25, free: true, owner: 3 },
  { title: 'Rooftop Cargo Box', desc: 'Thule cargo box, fits most roof racks. 16 cubic feet of space.', category: 'Camping & Travel', condition: 'like_new', price: 18, deposit: 100, free: false, owner: 3 },
  // Party & Events
  { title: 'Folding Tables (set of 3)', desc: 'Three 6-foot folding tables, perfect for parties and events.', category: 'Party & Events', condition: 'good', price: 10, deposit: 30, free: false, owner: 6 },
  { title: 'Bluetooth PA Speaker', desc: 'JBL PartyBox 310. Loud enough for any backyard party.', category: 'Party & Events', condition: 'like_new', price: 15, deposit: 75, free: false, owner: 6 },
  { title: 'String Lights (200ft)', desc: 'Warm white outdoor string lights. Transform your backyard!', category: 'Party & Events', condition: 'good', price: 0, deposit: 0, free: true, owner: 6 },
  // Kids
  { title: 'Pack n Play', desc: 'Graco portable crib, barely used. Great for travel or guests with babies.', category: 'Kids & Baby', condition: 'like_new', price: 0, deposit: 25, free: true, owner: 0 },
  { title: 'Kids Bike (16")', desc: 'Specialized Riprock 16", great for ages 4-6. Training wheels included.', category: 'Kids & Baby', condition: 'good', price: 5, deposit: 30, free: false, owner: 0 },
  // Cleaning
  { title: 'Carpet Cleaner', desc: 'Bissell ProHeat carpet cleaner. Includes cleaning solution.', category: 'Cleaning', condition: 'good', price: 12, deposit: 50, free: false, owner: 9 },
  { title: 'Steam Mop', desc: 'Shark steam mop, chemical-free cleaning. Works on all hard floors.', category: 'Cleaning', condition: 'good', price: 0, deposit: 0, free: true, owner: 8 },
];

const WANTED_POSTS = [
  { title: 'Looking for a ladder this weekend', desc: 'Need a tall extension ladder (24ft+) to clean gutters this Saturday. Will return same day!', owner: 8 },
  { title: 'Stand mixer for birthday cake', desc: 'Making a 3-tier birthday cake this Friday. Anyone have a stand mixer I can borrow for a couple days?', owner: 7 },
];

const DISCUSSIONS = [
  { listingIdx: 0, userIdx: 8, content: 'Does this come with drill bits?' },
  { listingIdx: 0, userIdx: 1, content: 'Yes! I have a full set of bits you can borrow too.', isReply: true },
  { listingIdx: 3, userIdx: 0, content: 'Can I borrow this for a whole weekend?' },
  { listingIdx: 3, userIdx: 2, content: 'Absolutely! Just let me know which weekend works.', isReply: true },
  { listingIdx: 9, userIdx: 7, content: 'Does this come with an SD card?' },
  { listingIdx: 12, userIdx: 9, content: 'What size frame is this? I\'m 5\'10".' },
  { listingIdx: 12, userIdx: 7, content: 'It\'s a medium frame, perfect for 5\'7" to 5\'11"!', isReply: true },
  { listingIdx: 15, userIdx: 0, content: 'Is this tent waterproof? Forecast shows some rain.' },
  { listingIdx: 15, userIdx: 3, content: 'Yep, full rain fly included. Used it in a downpour last month, stayed bone dry.', isReply: true },
  { listingIdx: 19, userIdx: 3, content: 'How loud does this speaker get? Having a block party.' },
];

const MESSAGES = [
  { from: 0, to: 1, messages: [
    { sender: 0, text: 'Hi Mike! I\'d love to borrow the stand mixer this Saturday.' },
    { sender: 1, text: 'Sure thing! It\'ll be ready for pickup anytime after 9am.' },
    { sender: 0, text: 'Perfect, I\'ll swing by around 10. Thanks!' },
    { sender: 1, text: 'Sounds great! I\'ll leave it on the porch.' },
  ]},
  { from: 8, to: 3, messages: [
    { sender: 8, text: 'Hey James, is the tent still available for next weekend?' },
    { sender: 3, text: 'Yes it is! First time camping?' },
    { sender: 8, text: 'Yep, taking the kids. Any tips?' },
    { sender: 3, text: 'I\'ll include a camping checklist when you pick up. You\'ll love it!' },
  ]},
  { from: 7, to: 4, messages: [
    { sender: 7, text: 'Could I borrow the projector for a backyard movie night this Friday?' },
    { sender: 4, text: 'Of course! I\'ll throw in an HDMI cable too.' },
  ]},
  { from: 9, to: 7, messages: [
    { sender: 9, text: 'Is the mountain bike available tomorrow?' },
    { sender: 7, text: 'Sure is! Just had it tuned up.' },
    { sender: 9, text: 'Awesome, I\'ll come grab it in the morning.' },
  ]},
];

async function cleanup() {
  console.log('Cleaning up screenshot seed data...');

  // Delete in dependency order
  await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user1_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed') OR user2_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed'))`);
  await query(`DELETE FROM conversations WHERE user1_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed') OR user2_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM listing_discussions WHERE listing_id IN (SELECT id FROM listings WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed'))`);
  await query(`DELETE FROM listing_photos WHERE listing_id IN (SELECT id FROM listings WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed'))`);
  await query(`DELETE FROM saved_listings WHERE listing_id IN (SELECT id FROM listings WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')) OR user_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM ratings WHERE rater_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed') OR ratee_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM borrow_transactions WHERE borrower_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed') OR lender_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM item_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM friendships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed') OR friend_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM community_memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM listings WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@screenshot.seed')`);
  await query(`DELETE FROM users WHERE email LIKE '%@screenshot.seed'`);

  console.log('Cleanup complete.');
}

async function seed() {
  console.log('Seeding screenshot data...');

  // Clean up any previous seed data first
  await cleanup();

  // Get category IDs
  const catResult = await query('SELECT id, slug FROM categories');
  const categories = {};
  for (const row of catResult.rows) {
    categories[row.slug] = row.id;
  }
  const categorySlugMap = {
    'Tools & Hardware': 'tools-hardware',
    'Kitchen & Cooking': 'kitchen-cooking',
    'Garden & Outdoor': 'garden-outdoor',
    'Electronics & Tech': 'electronics-tech',
    'Sports & Recreation': 'sports-recreation',
    'Camping & Travel': 'camping-travel',
    'Party & Events': 'party-events',
    'Kids & Baby': 'kids-baby',
    'Cleaning': 'cleaning',
  };

  // Get community (Upton)
  const communityResult = await query("SELECT id FROM communities WHERE city = 'Upton' LIMIT 1");
  const communityId = communityResult.rows[0]?.id;
  if (!communityId) {
    console.error('No Upton community found. Run migrations first.');
    process.exit(1);
  }

  // 1. Create users
  const passwordHash = await bcrypt.hash('Screenshot1!', 10);
  const userIds = [];

  for (let i = 0; i < USERS.length; i++) {
    const u = USERS[i];
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, bio, city, state, status, subscription_tier, is_verified, profile_photo_url, rating, rating_count, lender_rating, lender_rating_count, borrower_rating, borrower_rating_count, total_transactions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified', 'neighborhood', true, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [u.email, passwordHash, u.firstName, u.lastName, u.bio, u.city, u.state, PHOTOS.profiles[i],
       (4.2 + Math.random() * 0.8).toFixed(1), // 4.2-5.0 overall rating
       Math.floor(5 + Math.random() * 30), // 5-35 ratings
       (4.3 + Math.random() * 0.7).toFixed(1), // lender rating
       Math.floor(3 + Math.random() * 15),
       (4.2 + Math.random() * 0.8).toFixed(1), // borrower rating
       Math.floor(2 + Math.random() * 15),
       Math.floor(3 + Math.random() * 25), // 3-28 transactions
      ]
    );
    userIds.push(result.rows[0].id);
    console.log(`  Created user: ${u.firstName} ${u.lastName}`);
  }

  // 2. Add all users to community
  for (let i = 0; i < userIds.length; i++) {
    await query(
      `INSERT INTO community_memberships (user_id, community_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, community_id) DO NOTHING`,
      [userIds[i], communityId, i === 0 ? 'organizer' : 'member']
    );
  }
  console.log('  Added users to community');

  // 3. Create friendships (interconnect several users)
  const friendPairs = [[0,1],[0,2],[0,3],[1,2],[1,5],[2,4],[3,7],[4,6],[5,9],[6,8],[7,9],[8,9],[0,9],[3,5]];
  for (const [a, b] of friendPairs) {
    await query(`INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted') ON CONFLICT DO NOTHING`, [userIds[a], userIds[b]]);
    await query(`INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted') ON CONFLICT DO NOTHING`, [userIds[b], userIds[a]]);
  }
  console.log('  Created friendships');

  // 4. Create listings with photos
  const listingIds = [];

  for (let i = 0; i < LISTINGS.length; i++) {
    const l = LISTINGS[i];
    const catSlug = categorySlugMap[l.category];
    const catId = categories[catSlug];
    const ownerId = userIds[l.owner];

    const daysAgo = Math.floor(1 + Math.random() * 30);
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

    const result = await query(
      `INSERT INTO listings (owner_id, community_id, category_id, title, description, condition, is_free, price_per_day, deposit_amount, min_duration, max_duration, late_fee_per_day, visibility, status, is_available, times_borrowed, total_earnings, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 14, $10, 'neighborhood', 'active', true, $11, $12, $13)
       RETURNING id`,
      [ownerId, communityId, catId, l.title, l.desc, l.condition,
       l.free, l.price, l.deposit, l.free ? 0 : Math.max(2, l.price * 0.5),
       Math.floor(Math.random() * 8), // times_borrowed
       (l.price * Math.floor(Math.random() * 15)).toFixed(2), // total_earnings
       createdAt,
      ]
    );
    listingIds.push(result.rows[0].id);

    // Add photo matched to this specific listing
    if (PHOTOS.listings[i]) {
      await query(
        'INSERT INTO listing_photos (listing_id, url, sort_order) VALUES ($1, $2, 0)',
        [result.rows[0].id, PHOTOS.listings[i]]
      );
    }
  }
  console.log(`  Created ${listingIds.length} listings with photos`);

  // 5. Create wanted posts (item_requests)
  for (const wp of WANTED_POSTS) {
    const daysAgo = Math.floor(Math.random() * 5);
    const neededUntil = new Date(Date.now() + (3 + Math.random() * 10) * 86400000).toISOString();
    await query(
      `INSERT INTO item_requests (user_id, community_id, title, description, status, needed_until, created_at)
       VALUES ($1, $2, $3, $4, 'open', $5, $6)`,
      [userIds[wp.owner], communityId, wp.title, wp.desc, neededUntil,
       new Date(Date.now() - daysAgo * 86400000).toISOString()]
    );
  }
  console.log(`  Created ${WANTED_POSTS.length} wanted posts`);

  // 6. Create discussions on listings
  const discussionIds = {};
  for (const d of DISCUSSIONS) {
    const listingId = listingIds[d.listingIdx];
    const userId = userIds[d.userIdx];
    const parentId = d.isReply ? discussionIds[d.listingIdx] : null;

    const result = await query(
      'INSERT INTO listing_discussions (listing_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [listingId, userId, d.content, parentId]
    );
    if (!d.isReply) {
      discussionIds[d.listingIdx] = result.rows[0].id;
    }
  }
  console.log(`  Created ${DISCUSSIONS.length} discussion comments`);

  // 7. Create conversations and messages
  for (const conv of MESSAGES) {
    const user1 = userIds[conv.from];
    const user2 = userIds[conv.to];

    const result = await query(
      'INSERT INTO conversations (user1_id, user2_id) VALUES ($1, $2) RETURNING id',
      [user1, user2]
    );
    const convId = result.rows[0].id;

    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i];
      const senderId = userIds[msg.sender];
      const createdAt = new Date(Date.now() - (conv.messages.length - i) * 3600000).toISOString();
      await query(
        'INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4)',
        [convId, senderId, msg.text, createdAt]
      );
    }
  }
  console.log(`  Created ${MESSAGES.length} conversations with messages`);

  // 8. Create some completed transactions with ratings
  const txnPairs = [
    { borrower: 0, lender: 1, listing: 3, days: 3, status: 'completed' },
    { borrower: 8, lender: 3, listing: 15, days: 4, status: 'completed' },
    { borrower: 7, lender: 4, listing: 10, days: 2, status: 'completed' },
    { borrower: 9, lender: 7, listing: 12, days: 5, status: 'returned' },
    { borrower: 2, lender: 5, listing: 6, days: 1, status: 'completed' },
    { borrower: 0, lender: 6, listing: 19, days: 1, status: 'picked_up' },
    { borrower: 3, lender: 0, listing: 2, days: 2, status: 'approved' },
  ];

  for (const txn of txnPairs) {
    const listing = LISTINGS[txn.listing];
    const rentalFee = listing.price * txn.days;
    const serviceFee = rentalFee * 0.03;
    const platformFee = rentalFee * 0.03;
    const lenderPayout = rentalFee - platformFee;
    const startDate = new Date(Date.now() - (txn.days + 3) * 86400000);
    const endDate = new Date(startDate.getTime() + txn.days * 86400000);

    const result = await query(
      `INSERT INTO borrow_transactions (borrower_id, lender_id, listing_id, status, rental_days, daily_rate, rental_fee, deposit_amount, borrower_service_fee, platform_fee, lender_payout, requested_start_date, requested_end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [userIds[txn.borrower], userIds[txn.lender], listingIds[txn.listing],
       txn.status, txn.days, listing.price, rentalFee, listing.deposit,
       serviceFee, platformFee, lenderPayout,
       startDate.toISOString(), endDate.toISOString()]
    );

    // Add ratings for completed transactions
    if (txn.status === 'completed') {
      const rating = 4 + Math.round(Math.random());
      await query(
        `INSERT INTO ratings (transaction_id, rater_id, ratee_id, rating, comment, is_lender_rating)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [result.rows[0].id, userIds[txn.borrower], userIds[txn.lender],
         rating, ['Great lender, super easy!', 'Item was exactly as described. Thanks!', 'Fast and friendly. Would borrow again!', 'Awesome neighbor, 10/10!'][Math.floor(Math.random() * 4)]]
      );
      await query(
        `INSERT INTO ratings (transaction_id, rater_id, ratee_id, rating, comment, is_lender_rating)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [result.rows[0].id, userIds[txn.lender], userIds[txn.borrower],
         rating, ['Returned in perfect condition!', 'Responsible borrower, anytime!', 'Took great care of the item.', 'Punctual and communicative.'][Math.floor(Math.random() * 4)]]
      );
    }
  }
  console.log(`  Created ${txnPairs.length} transactions with ratings`);

  // 9. Create some saved listings
  const saves = [[0,9],[0,12],[8,15],[8,3],[7,10],[2,6],[9,0],[3,19]];
  for (const [userIdx, listingIdx] of saves) {
    await query(
      'INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userIds[userIdx], listingIds[listingIdx]]
    ).catch(() => {});
  }
  console.log('  Created saved listings');

  // 10. Create notifications
  const notifs = [
    { user: 0, type: 'borrow_request', title: 'New Borrow Request', body: 'Tom G. wants to borrow your Pressure Washer for 2 days' },
    { user: 0, type: 'discussion_reply', title: 'New Reply', body: 'Rachel K. replied to your question about the DeWalt Power Drill' },
    { user: 0, type: 'rating_received', title: 'New Rating', body: 'Mike R. left you a 5-star review!' },
    { user: 0, type: 'return_reminder', title: 'Return Reminder', body: 'Don\'t forget to return the PA Speaker to Lisa N. tomorrow' },
    { user: 8, type: 'request_approved', title: 'Request Approved!', body: 'James W. approved your request for the 4-Person Tent' },
    { user: 7, type: 'new_message', title: 'New Message', body: 'Priya P.: Of course! I\'ll throw in an HDMI cable too.' },
  ];
  for (const n of notifs) {
    await query(
      'INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)',
      [userIds[n.user], n.type, n.title, n.body]
    );
  }
  console.log(`  Created ${notifs.length} notifications`);

  console.log('\n--- Screenshot seed complete! ---');
  console.log(`Login as any user with password: Screenshot1!`);
  console.log('Example accounts:');
  for (const u of USERS.slice(0, 3)) {
    console.log(`  ${u.firstName} ${u.lastName}: ${u.email}`);
  }
}

// Run
const isCleanup = process.argv.includes('--cleanup');

try {
  if (isCleanup) {
    await cleanup();
  } else {
    await seed();
  }
} catch (err) {
  console.error('Error:', err);
} finally {
  await pool.end();
}
