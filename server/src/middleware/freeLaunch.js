import { ENABLE_PAYMENTS } from '../utils/constants.js';

// Stop new charges, while leaving historical refunds, settlements and webhooks intact.
export function requirePaymentsEnabled(req, res, next) {
  if (ENABLE_PAYMENTS) return next();
  return res.status(403).json({ code: 'PAYMENTS_DISABLED', error: 'Borrowhood is free to use. Payments are unavailable.' });
}

export function freeListingOnly(req, res, next) {
  if (ENABLE_PAYMENTS) return next();
  const body = req.body || {};
  const paid = [body.isFree, body.is_free].some(value => value === false || value === 'false') ||
    [body.pricePerDay, body.price_per_day, body.depositAmount, body.deposit_amount]
      .some(value => value != null && Number(value) !== 0);
  if (paid) return res.status(400).json({ code: 'PAYMENTS_DISABLED', error: 'Listings must be free to borrow, with no fee or deposit.' });
  return next();
}
