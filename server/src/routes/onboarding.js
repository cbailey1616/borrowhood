import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = Router();

// ============================================
// PATCH /api/onboarding/step
// Update the user's current onboarding step (for resume on app kill)
// ============================================
router.patch('/step', authenticate,
  body('step').isInt({ min: 1, max: 5 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      await query(
        'UPDATE users SET onboarding_step = $1 WHERE id = $2',
        [req.body.step, req.user.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Update onboarding step error:', err);
      res.status(500).json({ error: 'Failed to update onboarding step' });
    }
  }
);

// ============================================
// POST /api/onboarding/complete
// Mark onboarding as completed
// ============================================
router.post('/complete', authenticate, async (req, res) => {
  try {
    await query(
      'UPDATE users SET onboarding_completed = true, onboarding_step = 5 WHERE id = $1',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Complete onboarding error:', err);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

export default router;
