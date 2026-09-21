# Apple verification purchase — staged, not live

The intended price is **US$1.99 once**, using an Apple non-consumable purchase.
Stripe Identity still performs the document/selfie check. A payment never sets
`is_verified`, changes identity status, or grants a verification grace period.

## Product configuration

- App: `com.borrowhood.app`, Apple app ID `6758581435`.
- Product: `com.borrowhood.app.verification`.
- Reference name: Borrowhood Identity Verification.
- English (U.S.) display name: Identity Verification.
- Description: One-time access to the identity verification process.
- Intended U.S. base price: $1.99, with Apple's comparable local prices.
- Keep Family Sharing off because identity verification is personal.
- Keep the product unavailable for sale while free launch continues. Product
  configuration alone does not establish Apple approval or release readiness.

## Server configuration and rollout

Deploy the server **before** the new mobile client: verification screens now need
`GET /api/identity/eligibility`. Keep `VERIFICATION_PAYMENT_MODE=free_launch`
(also the default) and leave `VERIFICATION_IAP_READY` unset. Do not change the
unrelated physical-rental `ENABLE_PAYMENTS` setting.

Startup installs the purchase schema before accepting requests. It takes a
one-time snapshot of previously verified users and users with an existing Stripe
identity session. Free-launch starts also receive durable free access. Restarting
the server after paid launch does not grandfather later paid users accidentally.

Before paid testing/activation:

1. Install the public Apple Root CA certificate files from
   <https://www.apple.com/certificateauthority/>. Set `APPLE_IAP_ROOT_CERT_PATHS`
   to their comma-separated absolute paths. The official Apple verifier checks
   signatures, certificate chains, bundle/environment and online certificate
   revocation. Allow outbound access required by those checks; restart when
   rotating certificates. Never use a certificate supplied by a client receipt.
2. Configure App Store Server Notifications **V2** to the deployed HTTPS
   `/webhooks/apple` endpoint for production and sandbox. Test delivery, duplicate
   notifications, refunds, revocations and refund reversals before enabling sales.
3. Set `VERIFICATION_IAP_SANDBOX_USER_IDS` only to explicit Borrowhood test-account
   UUIDs. Sandbox receipts do not grant access to ordinary production accounts.
   Do not accept an environment, owner, price or authorization flag from the app.
4. Use an isolated paid-mode test backend with `VERIFICATION_PAYMENT_MODE=apple_iap`
   and `VERIFICATION_IAP_READY=true` for StoreKit/device testing. Do not switch
   the live free-launch backend merely to test a purchase.

The signed-transaction implementation does not require an App Store API private
key. No Apple credentials or production configuration were added to this change.

## Purchase and identity invariants

- Free-launch verification does not initialize StoreKit or request a payment.
- Paid UI displays StoreKit's localized price, not a hardcoded dollar string.
- The authenticated account UUID is Apple's `appAccountToken`. The server verifies
  it, product, bundle, environment, type, dates and revocation state before saving
  an entitlement. Original transaction ownership cannot transfer between accounts.
- StoreKit transactions finish only after server acceptance. Restore and retry
  use the same validation path; incomplete checks resume without another purchase.
- Both hosted and legacy-native Stripe session endpoints enforce the same gate.
  Creation uses a user lock and stable Stripe idempotency keys.
- The old `/api/subscriptions/verify-payment` route permanently returns 410. Turning
  on unrelated physical-item payments cannot reactivate Stripe verification fees.
- Refund/revocation removes the payment entitlement, never the factual result of
  a completed identity check. Old purchase receipts cannot overwrite a recorded
  revocation; a verified refund reversal is required to restore that entitlement.
- A non-consumable does not charge again for retries. Additional billable Stripe
  checks can exceed the small margin, especially after a canceled/reset session.
  Set and test a fair reset/reverification policy before enabling charges.

## Validation completed (2026-09-21)

- Full mobile Jest suite: **142 suites, 1,276 tests passed**.
- Isolated server privacy suite: **36 files, 448 tests passed**, including 76
  Apple-verifier, entitlement, identity-session and router tests.
- Production iOS JavaScript/Hermes export completed successfully. This is not a
  signed native archive or proof of StoreKit sandbox behavior.
- Syntax checks passed for 104 server JavaScript files; `git diff --check` passed.
- The local disposable PostgreSQL integration suite could not run because this
  workspace has no PostgreSQL tools. No database was accessed by that attempt;
  PostgreSQL/migration CI validation remains required.
- Existing React test `act` warnings and an Android Google-services-file warning
  during iOS export did not fail these checks. Native iPhone/iPad StoreKit tests,
  real Apple sandbox receipts, and App Review remain outstanding.

## Release gates

- Run the full mobile suite and production iOS bundle export, isolated server
  privacy tests, and the disposable PostgreSQL/migration CI suite. Mocked StoreKit
  tests are not a substitute for a signed native build and real sandbox receipts.
- Build a new iOS archive using the existing cloud release workflow and an unused
  number greater than the latest uploaded build. Preserve the native
  refresh-control patch. Audit the actual archive: StoreKit is expected; native
  Stripe/PassKit remain disallowed.
- On iPhone and iPad: exercise free launch, paid purchase, cancellation, pending
  approval, interruption before/after server acceptance, restart, restore, account
  switching, unavailable product, failed network, and Stripe processing/failure.
  Verify payment alone never displays a verified badge. Check large text/VoiceOver.
- Supply a screenshot of the **actual new purchase screen**, not the old free
  verification screenshot. Review the account and exact build used by Apple.
- Apple's first non-consumable must be reviewed with an app version. Provide an
  honestly disclosed, working paid flow for review; do not rely on a hidden
  reviewer-only bypass or turn on an unreviewed flow later. Keep the product off
  sale while free launch continues. Creating a product is not Apple approval.
- Update the attached build and App Review notes only after testing the
  actual candidate. The cloud workflow submits to TestFlight, not App Review.
- Confirm Small Business Program approval before treating $1.99 as break-even:
  after 15% commission and one $1.50 check, about $0.19 remains; at 30%, about
  $0.11 is lost, before taxes, refunds, additional checks and other costs.

References: [Apple IAP review](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/),
[availability](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-availability-for-in-app-purchases/),
[Small Business Program](https://developer.apple.com/app-store/small-business-program/),
[Stripe Identity pricing](https://stripe.com/identity).
