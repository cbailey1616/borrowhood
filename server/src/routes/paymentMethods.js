import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import {
  createSetupIntent,
  listPaymentMethods,
  detachPaymentMethod,
  stripe,
} from '../services/stripe.js';

const router = Router();

// ============================================
// GET /api/payment-methods
// List saved payment methods
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );

    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.json([]);
    }

    const methods = await listPaymentMethods(customerId);

    // Get default payment method from customer
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPmId = customer.invoice_settings?.default_payment_method;

    res.json(
      methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        isDefault: pm.id === defaultPmId,
      }))
    );
  } catch (err) {
    console.error('List payment methods error:', err);
    res.status(500).json({ error: 'Failed to list payment methods' });
  }
});

// ============================================
// POST /api/payment-methods
// Create SetupIntent for saving a new card
// ============================================
router.post('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT email, stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );

    let customerId = result.rows[0]?.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: result.rows[0].email,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;

      await query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, req.user.id]
      );
    }

    const setupIntent = await createSetupIntent(customerId);

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error('Create setup intent error:', err);
    res.status(500).json({ error: 'Failed to create setup intent' });
  }
});

// ============================================
// POST /api/payment-methods/:id/default
// Set default payment method
// ============================================
router.post('/:id/default', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );

    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: req.params.id },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Set default payment method error:', err);
    res.status(500).json({ error: 'Failed to set default payment method' });
  }
});

// ============================================
// DELETE /api/payment-methods/:id
// Detach a payment method
// ============================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await detachPaymentMethod(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Detach payment method error:', err);
    res.status(500).json({ error: 'Failed to remove payment method' });
  }
});

export default router;
