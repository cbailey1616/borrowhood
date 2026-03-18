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

    // Fetch Connect account status for payout card display
    let connectStatus = null;
    if (connectId) {
      try {
        const account = await stripe.accounts.retrieve(connectId);
        connectStatus = {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
        };
      } catch (err) {
        console.error('Get Connect account status error:', err.message);
      }
    }

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
        totalRentalIncome: 0,
        totalPlatformFees: 0,
        totalStripeFees: 0,
      },
      recentTransactions: [],
      payouts: [],
      hasConnectAccount,
      connectStatus,
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

    // Statuses where payment has been captured (money earned)
    const earnedStatuses = ['paid', 'picked_up', 'return_pending', 'returned', 'completed'];

    // Fetch database stats for transactions where payment was captured
    try {
      const statsResult = await query(
        `SELECT
           COALESCE(SUM(lender_payout), 0)::numeric as total_earned,
           COALESCE(SUM(rental_fee), 0)::numeric as total_rental_income,
           COALESCE(SUM(platform_fee), 0)::numeric as total_platform_fees,
           COUNT(*) as total_rentals
         FROM borrow_transactions
         WHERE lender_id = $1
           AND status = ANY($2)`,
        [req.user.id, earnedStatuses]
      );

      const totalEarned = parseFloat(statsResult.rows[0]?.total_earned) || 0;
      const totalRentals = parseInt(statsResult.rows[0]?.total_rentals) || 0;
      const totalRentalIncome = parseFloat(statsResult.rows[0]?.total_rental_income) || 0;
      const totalPlatformFees = parseFloat(statsResult.rows[0]?.total_platform_fees) || 0;
      // Stripe charges 2.9% + $0.30 per transaction on the total charge
      const totalStripeFees = totalRentals * 0.30 + totalRentalIncome * 0.029;

      response.stats = {
        totalEarned,
        totalRentals,
        activeRentals: 0,
        averagePerRental: totalRentals > 0 ? totalEarned / totalRentals : 0,
        totalRentalIncome,
        totalPlatformFees,
        totalStripeFees: Math.round(totalStripeFees * 100) / 100,
      };
    } catch (err) {
      console.error('Get earnings stats error:', err.message);
    }

    // Fetch active rentals count separately so it can't break stats
    try {
      const activeResult = await query(
        `SELECT COUNT(*) as active_rentals
         FROM borrow_transactions
         WHERE lender_id = $1
           AND status NOT IN ('completed', 'returned', 'cancelled', 'rejected')`,
        [req.user.id]
      );

      response.stats.activeRentals = parseInt(activeResult.rows[0]?.active_rentals) || 0;
    } catch (err) {
      console.error('Get active rentals error:', err.message);
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
           AND t.status = ANY($2)
         ORDER BY t.created_at DESC
         LIMIT 20`,
        [req.user.id, earnedStatuses]
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
