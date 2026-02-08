import Stripe from 'stripe';
import crypto from 'crypto';

// SWITCH TO LIVE KEYS ONLY FOR APP STORE RELEASE
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// Customer Management
// ============================================

export async function createStripeCustomer(email, name, metadata = {}) {
  return stripe.customers.create({
    email,
    name,
    metadata,
  });
}

export async function getStripeCustomer(customerId) {
  return stripe.customers.retrieve(customerId);
}

// ============================================
// Identity Verification (Stripe Identity)
// ============================================

export async function createIdentityVerificationSession(customerId, returnUrl) {
  return stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: {
      customer_id: customerId,
    },
    options: {
      document: {
        require_id_number: false,
        require_live_capture: true,
        require_matching_selfie: true,
        allowed_types: ['driving_license', 'id_card', 'passport'],
      },
    },
    return_url: returnUrl,
  });
}

export async function getIdentityVerificationSession(sessionId) {
  return stripe.identity.verificationSessions.retrieve(sessionId, {
    expand: ['verified_outputs'],
  });
}

// ============================================
// Connect Account Management (for organizers receiving fees)
// ============================================

export async function createConnectAccount(email, metadata = {}, individual = {}) {
  const params = {
    type: 'express',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    business_profile: {
      url: 'https://borrowhood.com',
      product_description: 'Renting personal items to neighbors via Borrowhood',
    },
    metadata,
  };

  // Pre-fill individual details from identity verification
  if (Object.keys(individual).length > 0) {
    params.individual = individual;
  }

  return stripe.accounts.create(params);
}

export async function createConnectAccountLink(accountId, refreshUrl, returnUrl) {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}

export async function getConnectAccount(accountId) {
  return stripe.accounts.retrieve(accountId);
}

// ============================================
// Payment Intents (for borrowing transactions)
// ============================================

export async function createPaymentIntent({
  amount, // in cents
  customerId,
  metadata = {},
  captureMethod = 'manual', // manual for authorization hold
}) {
  const idempotencyKey = `pi_${customerId}_${crypto.randomUUID()}`;
  return stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: customerId,
    capture_method: captureMethod,
    automatic_payment_methods: {
      enabled: true,
    },
    metadata,
  }, {
    idempotencyKey,
  });
}

export async function getPaymentIntent(paymentIntentId) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function capturePaymentIntent(paymentIntentId, amountToCapture = null) {
  const params = {};
  if (amountToCapture !== null) {
    params.amount_to_capture = amountToCapture;
  }
  return stripe.paymentIntents.capture(paymentIntentId, params);
}

export async function cancelPaymentIntent(paymentIntentId) {
  return stripe.paymentIntents.cancel(paymentIntentId);
}

// ============================================
// Transfers (paying out to lenders and organizers)
// ============================================

export async function createTransfer({
  amount, // in cents
  destinationAccountId,
  metadata = {},
}) {
  return stripe.transfers.create({
    amount,
    currency: 'usd',
    destination: destinationAccountId,
    metadata,
  });
}

// ============================================
// Refunds
// ============================================

export async function refundPayment(paymentIntentId, amount = null) {
  const params = {
    payment_intent: paymentIntentId,
  };
  if (amount !== null) {
    params.amount = amount;
  }
  return stripe.refunds.create(params);
}

// ============================================
// Setup Intents (for saving payment methods)
// ============================================

export async function createSetupIntent(customerId) {
  return stripe.setupIntents.create({
    customer: customerId,
    automatic_payment_methods: {
      enabled: true,
    },
  });
}

// ============================================
// Payment Methods
// ============================================

export async function listPaymentMethods(customerId) {
  return stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });
}

export async function detachPaymentMethod(paymentMethodId) {
  return stripe.paymentMethods.detach(paymentMethodId);
}

// ============================================
// Ephemeral Keys (for PaymentSheet)
// ============================================

export async function createEphemeralKey(customerId, apiVersion) {
  return stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion }
  );
}

// ============================================
// Webhook signature verification
// ============================================

export function constructWebhookEvent(payload, signature, webhookSecret) {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export { stripe };
