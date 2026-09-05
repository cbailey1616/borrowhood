import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { query } from '../utils/db.js';

const router = Router();
// Aggregate records only. No search text, messages, photos, IDs or addresses returned.
router.get('/funnel', authenticate, requireAdmin, async (req, res) => {
  const days = Number(req.query.days || 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Days must be between 1 and 365.' });
  try {
    const result = await query(`
      WITH members AS (
        SELECT id, onboarding_completed FROM users WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
      ), requests AS (
        SELECT status, accepted_at, actual_pickup_at, actual_return_at FROM borrow_transactions
        WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
      )
      SELECT
        (SELECT COUNT(*) FROM members)::int AS signups,
        (SELECT COUNT(*) FROM members WHERE onboarding_completed = true)::int AS onboarded,
        (SELECT COUNT(*) FROM members m WHERE EXISTS (SELECT 1 FROM listings l WHERE l.owner_id = m.id))::int AS first_listers,
        (SELECT COUNT(*) FROM members m WHERE EXISTS (SELECT 1 FROM borrow_transactions t WHERE t.borrower_id = m.id))::int AS first_requesters,
        (SELECT COUNT(*) FROM requests)::int AS requests,
        (SELECT COUNT(*) FROM requests WHERE accepted_at IS NOT NULL OR actual_pickup_at IS NOT NULL OR actual_return_at IS NOT NULL OR status::text IN ('approved', 'paid', 'picked_up', 'returned', 'completed'))::int AS accepted,
        (SELECT COUNT(*) FROM requests WHERE actual_return_at IS NOT NULL OR status::text IN ('returned', 'completed'))::int AS returned
    `, [days]);
    const counts = result.rows[0];
    const rate = (value, total) => total ? Math.round(value / total * 1000) / 10 : null;
    res.json({ days, measuredAt: new Date().toISOString(), ...counts,
      onboardingRate: rate(counts.onboarded, counts.signups),
      listingRate: rate(counts.first_listers, counts.signups),
      acceptanceRate: rate(counts.accepted, counts.requests),
      returnRate: rate(counts.returned, counts.accepted),
      note: 'Member metrics use signup cohorts; exchange metrics use request cohorts. Recent requests may still be in progress. Historical approvals later cancelled before pickup may be undercounted; new approvals retain their timestamp.'
    });
  } catch (error) {
    console.error('Aggregate insights unavailable:', error.message);
    res.status(500).json({ error: 'Could not load insights.' });
  }
});
export default router;
