import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { listSafetyReports, reviewSafetyReport } from '../services/safetyReview.js';

const router = Router();
router.use(authenticate, requireAdmin);
router.get('/', async (req, res) => {
  const status = req.query.status || 'open';
  const page = Number(req.query.page || 1);
  if (!['open','reviewed','dismissed','all'].includes(status) || !Number.isInteger(page) || page < 1 || page > 10000)
    return res.status(400).json({ error: 'Choose a valid report filter and page.' });
  try { res.json(await listSafetyReports(status, page)); }
  catch { res.status(500).json({ error: 'Could not load reports. Please try again.' }); }
});
router.post('/:id/review', async (req, res) => {
  const { action, version } = req.body;
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id) ||
      !['dismiss','reopen','suspend','restore'].includes(action) || !Number.isInteger(version) || version < 0 || note.length < 3 || note.length > 2000)
    return res.status(400).json({ error: 'Choose an action and add a review note (3–2,000 characters).' });
  try { res.json(await reviewSafetyReport(req.user.id, req.params.id, { action, note, version })); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save this decision. Please try again.' }); }
});
export default router;
