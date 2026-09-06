# Fix batch after TestFlight 210

Chris subsequently authorized the TestFlight build. The Mac reconnected and the
tested source was synchronized (Mac commit 0053ac3, tree matching cloud 6b99293).
EAS build 1.0.0 (211) finished: e9ce64b9-5abd-4384-a18d-82121f0a8b9d.
Submission e742d9f5-b522-46c3-98ec-eeaedbb2d13d finished successfully on September
6 at 10:06:55 EDT. App Store Connect's immediately following status query still
listed 210 as its newest TestFlight build; availability of 211 is not confirmed.
The optional release-notes submission was rejected as Enterprise-only; normal
submission without that feature succeeded. No duplicate build was started.
Last confirmed available TestFlight version is still 1.0.0 (210). Backend
deployment, production migrations and storage-policy changes remain on hold.
Use synthetic test items until the coordinated privacy backend rollout is ready.

## Usability batch — September 6

- Home / Saved / My Items / Inbox / Profile navigation; own inventory and messages
  open first. Consistent Requests, Lend, Give away, Borrow dates and Borrow details.
- Compact, explicit item audience picker. Friends-only requests are blocked when
  the audience is empty or cannot be checked; invite/verification actions explain
  how to proceed without silently widening exposure.
- Shorter forms with optional details, today/weekend/calendar date choices and an
  editable one-week request expiry. Private item/request drafts survive reopening.
- Native drafts use account-scoped encrypted SecureStore chunks with publish-last
  manifests and serialized writes. A failed save is visible. Restored forms can
  be discarded explicitly. Photo URIs are retained, not durable copies of image
  bytes; users are told to reselect missing cached photos. Web sample preview
  uses sessionStorage only and never the live API.
- Feed and request detail both use the private Offer an item flow; existing items
  have thumbnails. No automatic exposure of the rest of the owner's inventory.
- Chat pins the relevant active exchange with dates/status, explicit approval and
  pickup confirmations, and one-tap access to return condition review. Multiple
  exchanges can be selected; historical paid exchanges use full details only.
- Text/photo send attempts are persisted before sending. Safe retries reuse a
  payload-bound UUID; pending attempts restore across chat entry points. This is
  capability-gated: old servers show check/refresh, not a duplicate-prone retry.
- Prepared server message idempotency uses transaction locks and a unique
  sender/request index. Nullable columns preserve old client compatibility.
  This migration and backend feature have NOT been deployed.
- Shorter private-first onboarding, identity/activity before secondary woodland
  ranks, honest list retry states, actual native version/build in Profile and
  local preview revision UI 05.

Validation: npm run test:usability passed 132 mobile checks (25 suites);
npm run test:privacy passed 48 isolated backend checks. An iOS JS/Hermes export
succeeded; Expo warned about the checkout's missing Android google-services.json.
This is not a signed native build. No new human usability study, native-device
pass, live storage audit, or real-Postgres concurrency pass is claimed.

See USABILITY_CHECKLIST.md for the still-pending first-user/device walkthrough.

## Implemented, unreleased

- Panel dismissal: visible iOS grab handle and labeled Close button; preserve
  swipe dismissal. Compact, labeled item action bar with safe-area spacing.
- Profile alignment from build 210 remains; profiles show reputation, not an
  inventory catalogue. No profile inventory request is made by the app.
- Private inventory by default. Explicit confirmation for accepted friends,
  one selected invite-only group, or optional verified-town item sharing.
- Town discovery starts with requests. Owners may privately offer one item to
  one requester for up to 14 days while the request remains open, and withdraw it.
- Server access checks cover browsing, direct item links, saved items, groups,
  suggestions, discussions, availability, chat attachments and photo delivery.
- Existing unreviewed listings are treated as private after the prepared migration.
  Approved/active exchange access is retained separately from discovery.
- Removed the rental-fee card and fee/deposit controls from the free launch.
  Simple “Free to borrow” / “Free to keep” wording; exchange records remain.
- Two-screen onboarding explains private inventory, request-first discovery,
  explicit audiences and direct free exchanges. Completed verification is required
  for town access, not for starting with your circle.
- Verification remains covered by Borrowhood during launch. No $1 charge enabled.
  Old subscription links open verification instead of obsolete checkout.
- Fixed Expo lazy-global initialization in Jest, updated stale UI assertions,
  and added onboarding, audience selection and private-offer regression coverage.
- Fixed a migration blocker caused by an older enum-dependent due-date index.
  Conversion and index restoration now happen together in one transaction.
- Restored participant photo access for completed/disputed exchanges, while
  keeping those items out of discovery. Final integration retest is pending.

## Repeatable checks

From mobile: npm run test:usability (includes test:fix-batch)
From server: npm run test:privacy
On the configured Mac, from server: npm run test:privacy:local -- --migrations

Passed on September 6: 84 mobile checks across 17 suites and 40 isolated server
checks. These use mocked native modules, database/storage clients and APIs:
they are not a real-device or end-to-end security certification.

All 174 source/script JavaScript files parsed successfully; git diff --check
passed. Re-run the two commands after further edits.

Additional September 6 checks: the initial 28 real PostgreSQL policy cases passed.
The reconstructed PostGIS schema and runtime migrations (including a repeat run)
passed after fixing the partial-index bug. Real HTTP tests exercised private
creation/offers/revocation and a free approval/pickup/return, then found a completed
exchange photo-access regression. That fix is synced, but the final expanded
SQL/HTTP rerun is not confirmed because the Mac connection stopped returning
output. Do not describe the full end-to-end suite as passed yet.

## Release blockers — not completed

- Reconnect the Mac and confirm npm run test:privacy:local -- --migrations passes
  after the completed/disputed photo fix. The expanded policy suite has 44 cases.
  The new runner creates its own disposable cluster with installed Postgres tools.
- Complete broader photo/API regression (avatars, chat, groups, evidence, and
  owner-deleted history) and production-schema compatibility review. The successful
  local migration rehearsal used the repository's PostGIS baseline, not a copy of
  the current Railway schema. Never point the normal test setup at production.
- Verify S3 public-access blocking and authorized/unauthorized image reads with
  the release's configured storage credentials. Neither workspace has AWS
  credentials configured. Railway exposes their variable names only; no live
  bucket permissions were checked or changed and no production keys were copied.
- Native check on an iPhone or configured simulator: long names and large text,
  parchment colors, badge alignment, modal swipe/Close, action bar, keyboard/chat,
  private offer -> approval -> pickup -> return, invite accept/revoke, and photos.
  The connected Mac does not currently provide xcrun simctl.
- TestFlight authorization is recorded above; complete device/integration gates
  and obtain separate approval for production backend/storage changes.

## Source handoff

Mirror the source checkpoint to Borrowhood-Local on the Mac and compare Git
tree hashes before handing off. Source sync is not a deployment or new build.

See server/PRIVACY_RELEASE.md for compatibility and rollout constraints.
