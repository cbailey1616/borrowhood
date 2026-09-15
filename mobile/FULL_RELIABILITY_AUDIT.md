# Reliability audit — September 15, 2026

The expanded audit covers exchanges, access rules, account switching, interrupted requests, posting retries, and responsive controls. Changes are held locally for the next update. No push, native build, TestFlight submission, production migration, or deployment was performed.

## Confirmed defects fixed

| Area | Defect | Result |
| --- | --- | --- |
| Availability calendar | Normal borrow requests populate requested dates, but the calendar read only optional scheduled dates. Returns awaiting confirmation were also omitted. | Calendar and availability checks use scheduled dates when present, otherwise requested dates, and include pending returns. Borrower identities and owner notes remain private. |
| Blocked dates | Requests and approvals could ignore an owner's blocked dates. | Both enforce blocks on the server. Availability writes and reservations share the inventory lock. Invalid or reversed date ranges return validation errors. |
| Account switching | Old requests, image preparation, login completion, or password changes could complete after a session changed. | Session guards reject old results. Upload phases stop before proceeding under another account. Credential writes and cleanup are serialized. |
| Account linking | The global token could overwrite the explicit token supplied for linking a newly authenticated account. | Explicit account-link authorization is preserved and cannot expire an unrelated current session. |
| Draft isolation | A delayed callback from the prior account could update or delete the new account's draft. | Draft updates, discards, retries, and pending publication preparation remain scoped to their original account/form. |
| Network stalls | API requests and response bodies could remain pending indefinitely; upload timers were not consistently cleared. | Bounded, abortable requests cover response-body reads and uploads. Failed JSON responses are reported instead of treated as empty successful data. |
| Duplicate publication | Retrying after a lost success response could publish another item, wanted post, comment, or reply. | Account-scoped submission receipts commit with the publication. Identical retries return the original result; changed payloads using an old key return 409. |
| Upload retry | An unchanged post retry could upload its photos again and create a different publication payload. | Item and wanted-post drafts store the exact payload and submission ID before POST, including photo references. Reopening the saved draft preserves that attempt. A failed draft save prevents submission. |
| Comment acknowledgments | Response-critical name lookups or notification errors after saving could report failure or leave the comment without its alert. | Name lookup precedes the write. Comments, submission receipts, Activity records, and trigger-created delivery jobs commit together or roll back together. A retry creates one comment and one alert per eligible recipient; external push delivery runs afterward. |
| Queue accessibility | Three secondary actions stayed in one narrow row with larger text; the approval label could overflow. | Secondary actions stack when effective width is limited. Labels can wrap, and action targets remain at least 44 points tall. |

## Tested coverage

| Area | Evidence |
| --- | --- |
| Exchanges and queues | Actual SQL/HTTP regressions for competing approval attempts, duplicate active requests, calendar fallback, scheduled overrides, owner blocks, invalid ranges, and participant-only immutable endorsements. Existing tests cover cancellation, pickup, return, transfer completion, reservation release, and rollback. |
| Audience rules | Actual access-policy SQL covers private, friend, neighborhood, circle, and town audiences; relationship revocation; suspended owners; expiring and revoked item-specific offers; and established-exchange exceptions. |
| Verification | Unverified friends and neighborhood members retain borrowing access. Town borrowing remains verified-only. Opted-in town giveaways, sales, and requests retain their intended access. |
| Account isolation | Mobile regressions cover stale successful and expired-session responses, explicit account-link tokens, old login/password completions, partial credential writes, upload interruption, and delayed draft cleanup. |
| Offline/retries | HTTP/SQL tests replay item, wanted-post, comment, and reply submissions. Tests check changed-payload conflicts, transaction rollback (including failure on a later notification recipient), account-scoped keys, retained form payloads, one photo upload, storage failures, and repeated Send taps. Existing chat tests cover durable immutable message retries and older-backend handling. |
| Navigation and layouts | Full mobile suite includes the preceding navigation audit, queue Back, delayed navigation, thread history, iPad chat/Split View, keyboard overlap/rotation/floating keyboard behavior, and the new narrow-screen/large-text queue cases. These are component/logic checks, not native pixel or touch checks. |
| Existing behavior | Full suites also cover signup/recovery, onboarding, feed stability, listing/request forms, profiles, ranks, saved items, friends/neighborhoods, notifications, and free-launch payment gates. |

## Validation results

- Mobile: **136 suites / 1,029 tests passed**.
- Server privacy/reliability: **25 suites / 279 tests passed**.
- Server free-launch: **1 suite / 30 tests passed**.
- Offline production JavaScript/Hermes exports: **iOS and Android passed**.
- Whitespace/error check: `git diff --check` passed.

The first mobile pass found one new test trying to type into an intentionally disabled composer. The test was corrected to exercise the real behavior: pending text stays locked, repeated Send is ignored, and confirmed completion clears/unlocks it. Focused form/comment retesting passed before the final full run. Expected injected-failure logs and existing React `act` warnings are not evidence of production errors.

Reproduce automated checks from the repository root:

```sh
(cd mobile && ./node_modules/.bin/jest --runInBand)
(cd server && ./node_modules/.bin/vitest run --config vitest.privacy.config.js)
(cd server && ./node_modules/.bin/vitest run --config vitest.free-launch.config.js)
(cd mobile && EXPO_OFFLINE=1 CI=1 ./node_modules/.bin/expo export --platform ios --platform android --output-dir /tmp/borrowhood-audit-export)
```

## Remaining release checks and limits

- The connected Mac was offline, and this environment has no native iOS/Android simulator. Physical keyboard overlap, tap/edge-swipe behavior, VoiceOver/TalkBack, large text, iPad rotation, and Split View still need device checks.
- Test real foreground/background/terminated notifications, two accounts on one device, multiple devices on one account, camera/photo permissions, and loss of connectivity during posting. Mocked network and component tests do not prove APNs/FCM delivery or OS behavior.
- SQL tests use disposable PGlite databases; external notifications, authentication providers, storage, and payment services are mocked. PGlite serializes transactions. Concurrent promises verify final invariants but do **not** prove independent PostgreSQL connection/row-lock races. Run the existing local PostgreSQL integration suite before release in a suitable environment.
- No production database or live Apple, Google, Stripe, email, or push-provider flow was exercised. In-app payment and paid-tier flows remain disabled.
- Publication retry protection requires the updated server. Deploy server first when release is authorized: startup now runs `ensurePublicationSchema` after `ensureNotificationSchema`, before accepting traffic. The new receipt table is additive and account records cascade on deletion. Existing clients without a submission ID remain compatible but do not gain retry deduplication.
- Item and wanted-post submission attempts survive reopening through encrypted drafts. Comment attempts remain in memory for the current discussion screen; this change does not add persistent comment drafts across app termination.
