# First-borrow release

## Apple verification purchase — staged integration

The integration supports a $1.99 one-time Apple non-consumable and defaults to
free launch. Deploy the server before a mobile build using the new eligibility
endpoint. Native StoreKit sandbox testing and App Review remain release gates. Follow
[`docs/qa/apple-verification-iap.md`](docs/qa/apple-verification-iap.md).

## Next update — push authorized; native build not yet submitted
- Typography validation: all 136 mobile suites / 1,029 tests passed after the style update; iOS Hermes export passed. TestFlight submission is blocked in this workspace: EAS setup network approval was cancelled and the connected Mac is offline.
- Approved lighter typography: regular DM Sans headings, names, prices, buttons and navigation across the app. Retain medium-weight unread/selected endorsement emphasis, provider branding, existing colors and font sizes. Physical-device large-text review remains pending.
- Expanded reliability audit: account/session and draft isolation, requested/scheduled calendar dates, blocked-date enforcement, immutable posting retries, atomic comment/Activity/delivery-job saves, bounded network requests, and narrow-screen/large-text queue controls. Detailed evidence and remaining limits: `mobile/FULL_RELIABILITY_AUDIT.md`.
- Publication retries require the server update first. Startup now also runs `ensurePublicationSchema` before accepting traffic; no production migration has been run. Item/request drafts retain exact submission payloads and photo references; older clients remain compatible.
- Expanded validation: 136 mobile suites / 1,029 tests, 25 server privacy/reliability suites / 279 tests, and the 30-test free-launch suite passed. iOS and Android offline Hermes exports passed. Native device checks and independent PostgreSQL concurrency validation remain open; PGlite serializes transactions.
- Navigation audit: preserve separate item/profile/exchange/chat history; ignore delayed navigation after leaving; return verification to its origin; align native Back with comment-thread and password-reset steps; prevent repeated discard prompts; refresh private-offer inventory and neighborhood discovery on return; make sheet headings dismiss on downward drag. Details and device checklist: `mobile/NAVIGATION_AUDIT.md`.
- Navigation validation: 136 mobile suites / 1,006 tests passed; offline iOS and Android Hermes exports and static route checks passed. Native swipe/touch and accessibility verification remains pending. No native build or deployment was submitted.
- Queue back-button follow-up: explicit themed header action returns to the previous screen; a standalone queue falls back to My Posts. Verify tapping Back and the iOS edge-swipe from My Posts, Inbox, an item, and a conversation on a device before release.
- Queue-back validation: six real-router header regressions and 18 queue-screen tests passed; all 43 transaction-detail tests passed on a separate rerun after one initial pickup-test timeout. Offline iOS Hermes export passed. Native iPhone touch/gesture verification remains pending; no build or deployment was submitted.
- Notification audit fixes: per-installation, multi-device push ownership; account-bound revocation before logout; retry after offline registration or phone-settings changes; clear stale notification taps and native badges on logout.
- Durable per-device push jobs now commit with notification records. A bounded worker retries temporary failures, checks Expo receipts, removes invalid tokens, and preserves real zero badges. Receipt success means APNs/FCM accepted the push, not proof it appeared on a device.
- Thread replies notify participating neighbors once (excluding self, blocked accounts, and people without post access); push and Activity taps open the exact thread/reply page, including older threads. Verification recovery and circle invitations now have templates and destinations.
- Return-reminder records, delivery jobs, and sent flags commit together. Messages sort newest-first. Mark all as read affects only the current Inbox tab.
- Deployment order: server first, including `ensureNotificationSchema` (startup fails if that schema is unavailable), then mobile. No migration has been run against production. Legacy single-device tokens are migrated only when ownership is unambiguous; clients re-register on launch. Existing builds do not gain the new logout behavior until updated.
- Device QA gate: two accounts on one phone; one account on iPhone and iPad; online/offline logout; expired sessions; Settings permission changes; foreground/background/terminated push taps; deleted/older threads; unread badges and tab-scoped read-all. Already handed-off pushes cannot be recalled from APNs/FCM; verify device behavior before release.
- Reliability checks: isolated database tests exercise migration replay, device transfers, revocation races, failure retries, receipts, invalid/rotated tokens, thread access, and atomic reminder rollback. Full mobile/server test totals and bundle checks are reported in the implementation handoff.
- September 15 local validation: all 131 mobile suites / 977 tests and all 22 isolated server suites / 246 tests passed. Re-ran the 27-test discussion suite after adding exact-reply scrolling. Offline iOS and Android Hermes bundle exports passed; `git diff --check` passed. No APNs/FCM/device-delivery claim is made from mocked-network tests.
- Approved People waiting redesign: compact requester identity with adjacent rank, dates below the name, one full-width Approve request action, and a smaller Message / Details / Decline row.
- Removed queue-card exchange counts and redundant position labels; retain oldest-first context for multiple requests, request messages, and availability safeguards.
- Before release: check this queue on a small iPhone and with larger text.

## Final launch gates — September 15 review

The automated pass is 1,338 tests at local commit `5ac7dff`; it does not establish that the release binary or production integrations are bug-free. The Mac is still offline. These checks remain before public launch:

- **Release build on devices:** use the exact candidate on a small iPhone and iPad. Run the full borrower/lender journey with two accounts, including queue Back, cancellation, pickup, return, endorsement, messages and threads. Repeat with large text and VoiceOver, rotation, split view, and the keyboard open.
- **Fresh install and upgrade:** install fresh and upgrade an existing tester install without clearing storage. Verify sessions, saved drafts, old conversations, photos, notification permissions, badges and routes after restart. Exercise expired sessions and denied camera/photo/location/notification permissions.
- **Real services and interrupted work:** Apple/Google sign-in, verification email delivery, Stripe verification return/webhook, and real push delivery in foreground/background/terminated states. Interrupt uploads and submissions with airplane mode or app termination, then recover without duplicate posts or account leakage.
- **Database and rollout rehearsal:** run the independent local PostgreSQL/HTTP/migration suite on a supported machine or CI. Rehearse schema upgrades twice with representative synthetic legacy records, race two approvals from separate connections, and verify older installed clients against the new backend. Release the server before the new mobile client. Confirm a backup/restore and application rollback path in an isolated environment.
- **Production observability and capacity:** verify crash/error capture, server alerting, slow-query monitoring, and a modest concurrent-user load rehearsal. Source review found that the mobile error boundary currently only logs to the console, and `/health` only reports that the process responds; neither proves remote crash reporting or database readiness. Dashboard/service configuration was not verified.
- **App Review:** test the review account, complete backend access, account deletion, reporting/blocking and support/privacy links on the candidate. Native Stripe packages and Apple Pay entitlements were removed for hosted identity verification; the new verification purchase uses StoreKit. Audit the exact signed archive before describing it to Apple, and ensure review notes and the attached build match the tested candidate. Official review checklist: https://developer.apple.com/app-store/review/guidelines/#before-you-submit
- **Candidate freeze:** after the final fixes, test one unchanged candidate with a small tester group and monitor errors before public release. Any change to fonts or text layout needs fresh keyboard, large-text and button-wrap checks.

## Implemented
- One welcome screen, then a town form; no contact, neighborhood, payment or identity setup required to browse.
- Town form supports manual entry and optional device location. Precise coordinates are not sent by this form.
- Debounced search ignores stale responses. Empty states distinguish no matches, no town, no inventory and request failures.
- An unsuccessful search can prefill a wanted-item title. Empty towns offer listing and friend-invitation entry points.
- Listing creation leads with photos and title. Category, description and condition controls are optional details. The default condition is explicitly disclosed, and visibility stays visible before publication.
- Transactions have role-specific next-step guidance, one cancellation control per state and safe-area padding on action footers.
- Reviews, completed exchanges and verified identity are emphasized. Ranks explicitly describe activity, not safety.
- Admin-only aggregate reporting: Profile → App insights. No new admin grants. GET /api/insights/funnel?days=30 supports 1–365 days.
- Approval timestamps are retained going forward; existing status data supplies historical counts. Report definitions and historical limitations are displayed.

## Automated validation
Run `cd server && npx vitest run --config vitest.free-launch.config.js`.
Run `cd mobile && npx expo export --platform ios --platform android`.
The isolated tests do not connect to a database or Stripe. Run the full mobile suite with `cd mobile && npx jest --runInBand --watch=false`.

## Physical-device checks still required
The connected Mac lacks `xcrun simctl`; no simulator visual result is claimed.
- On a small iPhone and with larger text, complete the two-screen signup without location permission.
- Enter a town manually, dismiss the keyboard, and reach the feed without a neighborhood or contacts.
- Search for no matches, clear search/filters, post a prefilled request, then retry in airplane mode.
- List with a photo/title and the disclosed defaults. Expand optional details and change condition before posting.
- Borrower and lender: request → approve → private pickup arrangements → pickup → return → review.
- Confirm pending returns and disputes do not read as a completed exchange.
- Check images of portrait and landscape items; verify the original full photo remains available in item details.
- Check the rank legend at large text and footer buttons above the home indicator.
- Admin report: refresh counts after a completed exchange; ordinary users must receive HTTP 403.

No physical-device visual review has yet been completed for this release.

## Parchment and chat follow-up
- Warm parchment backgrounds and cream surfaces replace the cool white palette.
- Chat refresh reconciles acknowledged messages by ID and keeps chronological order.
- First sends activate conversation polling; failed sends retain composer text; refresh does not force readers to the bottom.
- New-message indicator, loading send button, photo attachment target and message refresh errors added.
- Verify chat on a physical device: keyboard, long drafts, photos, reactions, deletion, read receipts, offline failure and reading older messages during receipt.
- 25 isolated checks pass, including stale polling, deduplication, read receipts and deletion reconciliation.
