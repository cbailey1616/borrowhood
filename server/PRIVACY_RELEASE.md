# Private-first release checklist

Status: implementation prepared; the Mac reconnected and Chris's authorized
TestFlight build 211 finished and was submitted successfully. Apple availability
is not yet confirmed (the first post-submit query still listed 210). Production
migrations, backend deployment and bucket-policy changes remain on hold pending
separate approval. Use synthetic items for this UI beta until coordinated rollout.

## Audience rules

| Choice | Access | Discovery |
| --- | --- | --- |
| Private inventory | Owner; separate explicit offers and approved exchanges | Owner's My Items only |
| My friends | Accepted friends in either direction | Authorized friends only |
| A group | Owner and viewer both active in the selected invite-only group | That group only |
| Verified town | Explicit item opt-in; both people actually verified in the same city and state | Authorized town feed |
| Private offer | One item, one requester, open/unexpired request, up to 14 days; revocable | Never adds item to public/town discovery |

Verification does not guarantee good behavior or unlock private inventory.
Screenshots, previously downloaded content and manually shared pickup information
cannot be recalled. Signed image URLs are short-lived bearer links for an
authorized viewer; do not describe them as impossible to copy. The server checks
that viewer's current permission before serving a signed image.

## Compatibility and data

- The prepared migration gives existing listings privacy_version=0. They become
  effectively private until their owner reviews and confirms an audience. Existing
  visibility values and inventory records are not deleted or silently republished.
- Old clients that try to publish without sharingConfirmed=true receive a review
  error. Coordinate the backend, app and in-app explanation; rehearse this path.
- Approved/active/returned/completed/disputed exchange access is distinct from
  discovery. Pending, rejected and cancelled requests do not grant access.
  Complete the expanded real-database regression before release; confirm the
  intended historical-photo behavior for owner-deleted items separately.
- New listing uploads must belong to the owner. Image analysis reads only owned
  stored files, not arbitrary URLs. Direct raw listing-upload URLs are blocked.
- S3 delivery requires private bucket access. All four Block Public Access flags
  must be enabled and the runtime role must permit the read-only readiness check.
  This code checks configuration; it does not change permissions.
- A private bucket also affects avatars, chat, community/group images and dispute
  evidence. Their authorized proxy paths need real storage regression checks.
  Older installed clients may cache raw URLs and lose image access after lockdown.
- Keep ENABLE_PAYMENTS disabled. No rental payment/deposit collection or new
  verification charge is part of this batch; historical financial records remain.
  Re-enabling paid features would require a separate authorization/access review.

## Required validation before release

1. Run npm run test:privacy (isolated, no live services) and the mobile
   npm run test:fix-batch command.
2. On the configured Mac, run npm run test:privacy:local -- --migrations.
   This creates a fresh loopback-only, password-protected Postgres cluster,
   runs policy checks, reconstructs the checked-in PostGIS schema, rehearses
   runtime migrations twice and exercises real HTTP routes with synthetic users.
   External HTTP/fetch is blocked during HTTP checks. It stops the cluster and
   removes its own temporary data after shutdown; no .env is loaded or production
   credentials inherited. The reconstructed schema is not a production snapshot.
   For policy checks alone, omit --migrations. The standalone
   test:privacy:postgres command accepts only a local borrowhood_privacy_test URL.
3. Rehearse migrations and full HTTP tests in isolated staging with synthetic
   users: owner, accepted friend, pending friend, active/pending/removed group
   member, verified neighbor, same-city other-state user, unverified user.
4. Confirm denied direct links, saved items, photo URLs and chat attachments; test
   offer withdrawal/expiry/request closure, removed friendships/group members,
   an owner's group departure, and retained approved exchange access.
5. Verify public S3 reads fail while authorized uploads/proxy reads and edits
   succeed, including legacy images and photos in non-listing screens. Check
   expiry/refresh behavior, image caching and logout/session revocation.
6. Test the native flow on-device, including dynamic text, long names, modal
   gestures, safe areas, keyboard/chat, and both sides of pickup/return.
7. TestFlight approval is recorded in mobile/FIX_BATCH.md. Obtain Chris's separate
   approval for backend/migrations/storage and coordinate rollout and rollback
   without re-exposing inventories.

## Usability / chat recovery addition

- Runtime migrations add messages.client_request_id, client_request_hash, and
  unique idx_messages_client_request (sender_id, client_request_id).
- GET /messages/capabilities advertises retry support only when the columns and
  index are present. The client does not blindly retry against old servers.
- Send keys bind sender, recipient, listing, text and photo. A replay returns the
  same message ID; changed payloads return 409. Transaction-scoped advisory locks
  serialize duplicate keys and first conversation creation. Listing ACL checks
  still run before an attachment can be sent or replayed.
- Isolated tests: 48 passed, including eight mocked-delivery cases. The disposable
  HTTP rehearsal now includes concurrent sends, one-row assertions, replay and
  conflicting-payload rejection. This actual PostgreSQL addition has NOT run yet.
- Nothing in this batch deploys the server or mutates production data.

## September 6 local validation

- Installed server dependencies and notarized PostgreSQL 18.6 tools in the Mac's
  user Applications folder. Xcode is still not installed. No system PATH changes,
  Gatekeeper bypasses or dependency install-script approvals were made.
- Passed the initial 28 actual PostgreSQL policy checks and schema reconstruction
  from 17 checked-in SQL files, then runtime migrations twice. The rehearsal found
  an enum-dependent partial-index bug; the fix makes conversion and index
  restoration atomic, and the corrected rehearsal passed.
- The first real HTTP run reached private creation, single-person offers,
  withdrawal, free approval, pickup and return. It then caught missing participant
  photo access after completion. Completed/disputed access is now included without
  adding these items to discovery; the policy suite was expanded to 44 checks.
- Final expanded SQL/HTTP retest output is UNCONFIRMED: the Mac stopped returning
  process output. Do not count this final suite as passed until rerun and observed.
- The 40 isolated server tests still pass; mobile's last confirmed run remains
  84 checks. Neither is an on-device certification.
- Railway has only a production environment, with S3 variable names configured.
  No secret values were read or moved. No authorized read-only S3 connection is
  configured in either checkout; live bucket policy and image delivery remain
  unverified. Production data/storage have not been changed or used as fixtures.
