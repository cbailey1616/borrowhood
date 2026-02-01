import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/seasonal/suggestions
// Get seasonal suggestions based on current month
// ============================================
router.get('/suggestions', authenticate, async (req, res) => {
  try {
    const currentMonth = new Date().getMonth() + 1; // 1-12

    // Get active seasonal categories for current month
    const categories = await query(
      `SELECT id, name, description, icon, keywords
       FROM seasonal_categories
       WHERE is_active = true AND $1 = ANY(active_months)
       ORDER BY priority DESC
       LIMIT 5`,
      [currentMonth]
    );

    // For each category, find matching listings
    const suggestions = await Promise.all(categories.rows.map(async (cat) => {
      // Build search pattern from keywords
      const keywordPattern = cat.keywords.map(k => `%${k}%`).join('|');

      const listings = await query(
        `SELECT l.id, l.title, l.is_free, l.price_per_day,
                (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as photo_url,
                u.first_name as owner_first_name
         FROM listings l
         JOIN users u ON l.owner_id = u.id
         WHERE l.status = 'active'
           AND l.owner_id != $1
           AND (${cat.keywords.map((_, i) => `l.title ILIKE $${i + 2}`).join(' OR ')})
         ORDER BY l.created_at DESC
         LIMIT 6`,
        [req.user.id, ...cat.keywords.map(k => `%${k}%`)]
      );

      if (listings.rows.length === 0) return null;

      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        items: listings.rows.map(l => ({
          id: l.id,
          title: l.title,
          isFree: l.is_free,
          pricePerDay: l.price_per_day ? parseFloat(l.price_per_day) : null,
          photoUrl: l.photo_url,
          ownerFirstName: l.owner_first_name,
        })),
      };
    }));

    res.json(suggestions.filter(s => s !== null));
  } catch (err) {
    console.error('Get seasonal suggestions error:', err);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// ============================================
// GET /api/seasonal/featured
// Get a single featured seasonal banner for the feed
// ============================================
router.get('/featured', authenticate, async (req, res) => {
  try {
    const currentMonth = new Date().getMonth() + 1;

    // Get top priority seasonal category
    const category = await query(
      `SELECT id, name, description, icon, keywords
       FROM seasonal_categories
       WHERE is_active = true AND $1 = ANY(active_months)
       ORDER BY priority DESC
       LIMIT 1`,
      [currentMonth]
    );

    if (category.rows.length === 0) {
      return res.json(null);
    }

    const cat = category.rows[0];

    // Count matching items
    const countResult = await query(
      `SELECT COUNT(*) as count
       FROM listings l
       WHERE l.status = 'active'
         AND l.owner_id != $1
         AND (${cat.keywords.map((_, i) => `l.title ILIKE $${i + 2}`).join(' OR ')})`,
      [req.user.id, ...cat.keywords.map(k => `%${k}%`)]
    );

    const itemCount = parseInt(countResult.rows[0].count);

    if (itemCount === 0) {
      return res.json(null);
    }

    res.json({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      itemCount,
    });
  } catch (err) {
    console.error('Get featured seasonal error:', err);
    res.status(500).json({ error: 'Failed to get featured' });
  }
});

export default router;
