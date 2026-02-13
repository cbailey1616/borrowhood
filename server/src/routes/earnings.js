import { Router } from 'express';
import { query } from '../utils/db.js';
import { authenticate } from '../middleware/auth.js';
import { stripe } from '../services/stripe.js';

const router = Router();

// ============================================
// GET /api/earnings
// Get earnings overview including balance, stats, recent transactions, and payouts
// ============================================
router.get('/', authenticate, async (req, res) => {
  try {
    // Get user's Stripe Connect account ID
    const userResult = await query(
      'SELECT stripe_connect_account_id FROM users WHERE id = $1',
      [req.user.id]
    );

    const connectId = userResult.rows[0]?.stripe_connect_account_id;
    const hasConnectAccount = !!connectId;

    // Initialize response object
    const response = {
      balance: {
        available: 0,
        pending: 0,
        currency: 'usd',
      },
      stats: {
        totalEarned: 0,
        totalRentals: 0,
        activeRentals: 0,
        averagePerRental: 0,
      },
      recentTransactions: [],
      payouts: [],
      hasConnectAccount,
    };

    // Fetch Stripe balance if Connect account exists
    if (connectId) {
      try {
        const balance = await stripe.balance.retrieve({
          stripeAccount: connectId,
        });

        const available = (balance.available || [])
          .filter(b => b.currency === 'usd')
          .reduce((sum, b) => sum + b.amount, 0);

        const pending = (balance.pending || [])
          .filter(b => b.currency === 'usd')
          .reduce((sum, b) => sum + b.amount, 0);

        response.balance = {
          available: available / 100,
          pending: pending / 100,
          currency: 'usd',
        };
      } catch (err) {
        console.error('Get Stripe balance error:', err.message);
      }
    }

    // Fetch Stripe payouts if Connect account exists
    if (connectId) {
      try {
        const payoutsData = await stripe.payouts.list(
          { limit: 10 },
          { stripeAccount: connectId }
        );

        response.payouts = (payoutsData.data || []).map(payout => ({
          id: payout.id,
          amount: payout.amount / 100,
          status: payout.status,
          arrivalDate: payout.arrival_date,
          created: payout.created,
        }));
      } catch (err) {
        console.error('Get Stripe payouts error:', err.message);
      }
    }

    // Fetch database stats for completed/returned transactions
    try {
      const statsResult = await query(
        `SELECT
           COALESCE(SUM(lender_payout), 0) as total_earned,
           COUNT(*) as total_rentals
         FROM borrow_transactions
         WHERE lender_id = $1
           AND status IN ('completed', 'returned', 'return_pending')`,
        [req.user.id]
      );

      const totalEarned = parseFloat(statsResult.rows[0]?.total_earned) || 0;
      const totalRentals = parseInt(statsResult.rows[0]?.total_rentals) || 0;

      // Fetch active rentals count
      const activeResult = await query(
        `SELECT COUNT(*) as active_rentals
         FROM borrow_transactions
         WHERE lender_id = $1
           AND status NOT IN ('completed', 'returned', 'cancelled', 'rejected')`,
        [req.user.id]
      );

      const activeRentals = parseInt(activeResult.rows[0]?.active_rentals) || 0;

      response.stats = {
        totalEarned,
        totalRentals,
        activeRentals,
        averagePerRental: totalRentals > 0 ? totalEarned / totalRentals : 0,
      };
    } catch (err) {
      console.error('Get earnings stats error:', err.message);
    }

    // Fetch recent transactions
    try {
      const transactionsResult = await query(
        `SELECT
           t.id,
           t.status,
           t.lender_payout,
           t.created_at,
           t.actual_return_at,
           l.title as listing_title,
           (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY sort_order LIMIT 1) as listing_photo,
           b.first_name as borrower_first_name,
           b.last_name as borrower_last_name,
           b.profile_photo_url as borrower_photo
         FROM borrow_transactions t
         JOIN listings l ON t.listing_id = l.id
         JOIN users b ON t.borrower_id = b.id
         WHERE t.lender_id = $1
           AND t.status IN ('completed', 'returned', 'return_pending')
         ORDER BY t.created_at DESC
         LIMIT 20`,
        [req.user.id]
      );

      response.recentTransactions = transactionsResult.rows.map(t => ({
        id: t.id,
        status: t.status,
        listing: {
          title: t.listing_title,
          photo: t.listing_photo,
        },
        borrower: {
          firstName: t.borrower_first_name,
          lastName: t.borrower_last_name,
          profilePhotoUrl: t.borrower_photo,
        },
        lenderPayout: parseFloat(t.lender_payout) || 0,
        createdAt: t.created_at,
        actualReturnAt: t.actual_return_at,
      }));
    } catch (err) {
      console.error('Get recent transactions error:', err.message);
    }

    res.json(response);
  } catch (err) {
    console.error('Get earnings error:', err.message);
    res.status(500).json({ error: 'Failed to get earnings data' });
  }
});

export default router;
