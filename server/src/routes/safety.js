import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../utils/db.js';
import rateLimit from 'express-rate-limit';
const router = Router();
router.use(authenticate);
router.param('userId', async (req, res, next, id) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || id === req.user.id) return res.status(400).json({ error: 'Choose another user' });
  try {
    const user = await query('SELECT id FROM users WHERE id=$1', [id]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    next();
  } catch { res.status(500).json({ error: 'Could not check user' }); }
});
router.get('/:userId', async (req, res) => {
  try {
    const result = await query('SELECT 1 FROM user_blocks WHERE user_id=$1 AND blocked_id=$2', [req.user.id,req.params.userId]);
    res.json({ blocked: result.rows.length > 0 });
  } catch { res.status(500).json({ error: 'Could not load settings' }); }
});
router.post('/:userId/block', async (req, res) => {
  try {
    await query('INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.userId]);
    res.json({ blocked: true });
  } catch { res.status(500).json({ error: 'Could not block user' }); }
});
router.delete('/:userId/block', async (req, res) => {
  try {
    await query('DELETE FROM user_blocks WHERE user_id=$1 AND blocked_id=$2',[req.user.id,req.params.userId]);
    res.json({ blocked: false });
  } catch { res.status(500).json({ error: 'Could not unblock user' }); }
});
router.post('/:userId/report', rateLimit({ windowMs: 60 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.user.id,
  message: { error: 'You have submitted several reports. Please try again later or contact chris@borrowhood.net.' },
}), async (req, res) => {
  if (!['Scam or fraud','Harassment','Unsafe behavior','Inappropriate content'].includes(req.body.reason)) return res.status(400).json({ error: 'Choose a reason' });
  try {
    await query('INSERT INTO safety_reports(reporter_id,reported_id,reason) VALUES($1,$2,$3)',[req.user.id,req.params.userId,req.body.reason]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not send report' }); }
});
export default router;
