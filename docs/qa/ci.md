# Continuous integration repair — September 6, 2026

The main-branch run 34054983865 failed for real reasons: missing JWT_REFRESH_SECRET caused signup to throw before returning tokens; missing ADMIN_SECRET caused administrator tests to return 403; the mixed suite required actual Stripe sandbox credentials and asserted retired subscription/dispute contracts. The workflow also ignored SQL migration errors, called an empty job Lint, and duplicated Railway deployment with an unsafe replay of initial migrations.

## Current gates

- `cd server && npm test` runs all isolated privacy/auth unit tests, then starts a disposable loopback PostgreSQL cluster with generated JWT, refresh-token and admin secrets. It reconstructs and checks the schema, runs access-policy and real HTTP assertions, then runs **every top-level server test file**. External HTTP services are blocked; payment-history reads use a deterministic adapter. No environment files or production credentials are loaded.
- Transaction fixtures now grant real friendship visibility and assert borrowing without payment credentials. Historical disputes use claimant/respondent fields and verify private history and resolver permissions; opening new formal disputes returns 410. Subscription tests check free access, identity requirements and disabled payment initiation. Payment-history tests do not require an online Stripe account.
- `tests/stripe/` remains checked in as a legacy, opt-in sandbox suite. It describes the retired paid rollout and is **not evidence of passing current payment integration**. Existing `test:stripe` commands retain it; it requires dedicated sandbox configuration and contract updates before a paid product can be restored. The active free-launch and direct-fee tests assert current behavior instead.
- Mobile CI runs the full Jest suite (including smoke tests) and exports production iOS JavaScript. This is not a replacement for native EAS builds or device testing.
- Checkout/setup-node use Node 24 actions. Syntax checks actually execute. Every failure is fatal; no continue-on-error, ignored migrations or test-only production weakening.
- Railway already deploys its connected main branch and runs idempotent startup migrations. The obsolete parallel CLI deploy and initial-schema replay jobs were removed. **Railway auto-deploy is independent of these checks**; this change does not claim CI gates production deployment.

PostgreSQL binaries and PostGIS must be installed. On Linux set PRIVACY_PG_BIN to the installed PostgreSQL bin directory; on macOS the runner also discovers Postgres.app. The runner refuses existing or remote databases and removes its disposable cluster after shutdown.
