# Borrowhood build 215 — release QA

Date: 2026-09-06. iOS version 1.0.0 (215).

## Result

The automated mobile and isolated backend regression runs pass. Build 215 is available to internal TestFlight testers: Apple reports VALID and IN_BETA_TESTING. This is not a claim that every physical-device or third-party interaction has been verified.

Post-release finding: real Apple/Google attempts exposed a production upgrade gap—older databases lacked the social identity columns despite passing the fresh-database suite. GitHub commit `5413ad86f64119f9d29edb1775eb07f51f5fbab6` added the runtime schema repair and was deployed successfully. Production column metadata was verified afterward; the user's device then reached the existing-account connection form. Successful completion of that real provider connection is still awaiting user confirmation. Subsequent UI and cancellation work is recorded in [next-update.md](next-update.md).

- EAS build: `386e3103-9faa-41bc-af55-aadc0e4cbe48` — FINISHED.
- EAS submission: `9c8ac2c9-9f41-4996-90ed-a1021699aa6e` — FINISHED.
- Build 214 failed because its provisioning profile lacked Sign in with Apple. Signing was repaired and the replacement uses build 215.
- Google and Apple signup, account linking, and the shorter town onboarding are included. The later discussion about additional verification privileges is a proposal for a future update.

## Executed plan and results

| Area | Execution and expected behavior | Result |
| --- | --- | --- |
| Mobile regression | Render screens, exercise user actions, validate API calls and error handling across the existing Jest suite | 535/535 tests; 102/102 suites passed |
| Mobile smoke | Email signup/login, feed, listing detail, listing/request forms, borrowing, chat send, profile, saved items, friend search, notifications, verification route | 21/21 passed; included in the 535 total |
| Server regression | Real HTTP requests against real SQL for auth, onboarding, neighborhoods, friends, feed, listings, requests, saved items, messages, notifications, discussions, referrals and disabled payment guards | 196/196 passed in a fresh disposable PostgreSQL database |
| Focused privacy and auth | Sharing policy, photo authorization, message delivery, offline price validation, feed ranking, Google/Apple token and account-link handling | 74/74 tests passed |
| PostgreSQL policy matrix | Owner, friend, neighborhood, invite-only group, town and unauthorized viewer access | 53/53 checks passed |
| HTTP integration | Private creation, sharing offers and revocation, protected photos, borrowing approval/pickup/return, concurrent chat retries, block/report, feed pagination and refresh | 52/52 HTTP checks passed, plus social account assertions |
| Migrations | Reconstruct schema, apply runtime migrations, preserve private legacy items and due-date indexes, repeat migrations safely | Passed |
| Production smoke | Health returns 200; unauthenticated feed returns 401; missing Google/Apple credentials return 400 | Passed on production |
| iOS packaging | Native release compilation and corrected Apple signing | EAS build passed; submitted to App Store Connect |
| Browser visual inspection | Attempt to open the local sample-data preview | Blocked: cloud browser rejected localhost with ERR_BLOCKED_BY_CLIENT; no visual pass claimed |

## Feature-specific checks

### Signup and onboarding

- Provider token verification rejects invalid issuer, audience, expired tokens, missing configuration and unverified Google email.
- Provider cancellation is quiet and duplicate sign-in taps are prevented.
- Returning users retain their existing account and onboarding progress.
- A matching email alone never silently merges accounts. Linking requires signing into the existing account first; failed linking does not persist a session.
- Apple users whose name is unavailable enter it inline on the town screen. Provider-supplied names are not requested again.
- Town and state are required; device location is requested only after a tap. A failed profile save does not complete onboarding.
- Email password recovery exercises code verification, a one-time reset token, password replacement, invalid/expired rejection and token reuse rejection. Email delivery is mocked, not sent to real people.

### Sharing, discovery and trust

- Friends-only access requires an accepted friendship; old unreviewed private listings are not silently made public.
- Listing audience selection supports multiple shared audiences. Only-me cannot be combined with shared audiences.
- Verification remains necessary for town listing access even with in-app payments disabled.
- Owner-selected sharing changes take effect on detail, saved items, photos and previously created feed sessions.
- Refresh favors new/unseen candidates; unique click activity and requests affect ranking. Pagination is stable within a session and continues beyond the former 40-item cutoff.
- Neighbor suggestions require a shared neighborhood and work when no neighborhood has been joined.
- A referral reward does not confer identity verification.

### Listings, requests, chat and borrowing

- Listing and request validation, draft handling, form cancellation, audience controls and offline prices are covered by mobile tests.
- Optional listing prices remain informational; parties arrange payment themselves. In-app rental charges and deposits remain disabled.
- Saving, unsaving, comments and replies enforce listing access.
- Thread-to-DM controls preserve context and do not send a message without a user action.
- Message retry reconciliation avoids duplicates and preserves acknowledged sends during polling. Blocking prevents messages in both directions; safety reports remain available.
- Free borrowing is exercised through request, approval, pickup and return with no external Stripe call.
- My Posts, requests, Inbox exchanges, history, themed controls and identity badge behavior have component/screen regression coverage.

## Problems found and fixed

1. Town verification was incorrectly skipped when payments were disabled in the mobile access helper.
2. Suggested neighbors used an invalid PostgreSQL DISTINCT/ORDER BY query; explicit neighborhood suggestions also needed membership scoping.
3. The admin account reset referenced nonexistent latitude/longitude columns; it now clears the actual PostGIS location column.
4. Returned exchanges lacked their explicit history label.
5. Verification/referral copy still implied retired rental or identity benefits.
6. Old tests expected removed payment flows, old navigation labels, raw password-reset codes and pre-privacy fixture access. Fixtures and expectations now exercise the current contracts.

## Checks still requiring a real device or external service

These are pending, not passed or silently skipped:

| Check | Acceptance criteria |
| --- | --- |
| Fresh TestFlight install and update from 213 | Launch without a crash; existing account, drafts and saved state remain intact |
| Real Google consent and callback | New signup reaches town setup; returning login reaches the app; cancellation returns cleanly |
| Real Apple consent and Hide My Email | Callback returns to Borrowhood, name fallback works, repeat login reuses the account |
| Stripe Identity hosted/native flow | Start, cancel, resume and complete verification; badge reflects actual identity status |
| Camera, photo library and S3 | Permission denial/retry, new upload, restored draft photo and recipient-authorized image loading work |
| Push, deep links and cold start | Tapping a notification opens the intended thread/item after background or terminated launch |
| Physical UI and accessibility | Small/large iPhones, large text, VoiceOver, keyboard, date picker, sheet dismissal and back navigation remain usable |
| Unreliable connectivity | Airplane mode, reconnect and app backgrounding preserve drafts and do not duplicate a send |

Legacy live Stripe checkout/subscription suites and the old Maestro seeder were not run: those exercise retired payment behavior or expect externally connected data. Their nonpayment guards and retained UI routes are covered in the isolated suites. No test users, messages, listings, charges or identity sessions were created in production.

## Re-run commands

Run from `mobile/`:

```sh
npx jest --runInBand --json --outputFile=/tmp/borrowhood-mobile-results.json
```

Run from `server/`:

```sh
npm run test:privacy
npm run test:privacy:local -- --suite
```

The database runner requires installed PostgreSQL tools (or `PRIVACY_PG_BIN`). It starts a fresh loopback cluster, uses generated test credentials, blocks external service calls in the release suite and removes the cluster afterward. It does not load production environment files.
