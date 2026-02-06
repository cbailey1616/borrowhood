import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/categories
// Get all active categories
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, slug, icon, sort_order
       FROM categories
       WHERE is_active = true
       ORDER BY sort_order ASC, name ASC`
    );

    res.json(result.rows.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      sortOrder: c.sort_order,
    })));
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

export default router;
