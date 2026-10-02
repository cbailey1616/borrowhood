import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { listAdminReports } from '../services/adminReports.js';

const router = Router();
router.use(authenticate, requireAdmin);
router.get('/', async (req, res) => {
  const issue = req.query.issue || 'all';
  const state = req.query.state || 'pending';
  const page = Number(req.query.page || 1);
  if (!['all', 'non_return', 'damage', 'other'].includes(issue) ||
      !['pending', 'reviewed', 'all'].includes(state) || !Number.isInteger(page) || page < 1 || page > 10000)
    return res.status(400).json({ error: 'Choose a valid report filter and page.' });
  try { res.json(await listAdminReports(issue, state, page)); }
  catch { res.status(500).json({ error: 'Could not load reports. Please try again.' }); }
});
export default router;
