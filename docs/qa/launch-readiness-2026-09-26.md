# Launch reliability review — September 26, 2026

Status: the user authorized pushing the queued changes and creating a TestFlight build on September 26. CI validation, merge, and the signed cloud release are pending. Production capacity is not yet established; a TestFlight release does not establish it.

## Changes prepared

- The feed now loads a bounded group of recent posts before ranking. With the app's 20-post pages, each group spans 10 pages and each post-type query returns at most 201 candidates. Older groups remain reachable with keyset pagination. Ranking applies within each group, rather than across the entire post history. The Wanted ribbon keeps its initial order during a session.
- Saved feed order contains IDs only. Every page checks current visibility, membership, blocking, and post status. Expired sessions prompt a fresh feed; the mobile recovery action replaces the expired session. Snapshots expire after one day; old engagement records are removed in short batches after 31 days, preserving recent clicks.
- Feed badge checks use indexed newest-post lookups instead of an aggregate over every visible post. Wanted totals still require a count; bounded result rows do not mean all database work is constant as the dataset grows.
- Scheduled work uses a separate database pool and avoids overlapping runs of the same job in one process. The API defaults to 10 connections and background work to 8. Both pools still share the same database, and jobs still share the API process's CPU. Push ownership checks and transaction locks remain intact.
- Rank updates use a durable queue populated by exchange and endorsement changes. Each pass processes at most 100 members; idle passes no longer scan the entire membership.
- Health checks test database availability and fail promptly. Structured logs identify slow requests, failed requests, connection queues, and delayed background jobs without exposing private photo tokens. Shutdown drains requests and jobs before closing database pools.
- Private-photo failures now distinguish expected denial, missing files, and temporary storage/database failures. Temporary failures return 503 with a retry hint. This supplies evidence for diagnosing the observed production photo failures; their cause has not yet been confirmed.

## Executed checks

- Server privacy/reliability regression: **466 tests passed across 38 files**. Covers real PostgreSQL-compatible SQL through PGlite, privacy revocation, anonymous previews, stable pagination beyond 200 posts, microsecond cursors, retention, photo errors, health recovery, and separate database contexts.
- Mobile feed regression: **51 tests passed**, including expired-session recovery, retained posts after an ordinary request failure, and fresh session creation when refreshing.
- Local traffic rehearsal: **six checks passed**, including 925 read requests across feed, feed pagination, feed summary, chat, and activity at bursts of 10, 25, 50, and 100 concurrent clients. No HTTP errors occurred.
- Message retries: 100 send attempts across 50 distinct messages persisted exactly 50 messages and 50 delivery jobs.
- Synthetic restore: PGlite export restored into a separate database; row counts and full-row digests matched across nine tables. This is not a Railway backup restore.
- Server JavaScript syntax and diff whitespace checks passed.

The fixture contains 150 members, 10,000 listings, 1,000 Wanted posts, 100,000 feed events, 10,000 messages, 5,000 notifications, 1,000 exchanges, 1,000 endorsements, and 5,000 queued pushes. No real notifications or external requests were sent.

| Concurrent clients | Read requests | HTTP errors | Overall p95 |
| --- | ---: | ---: | ---: |
| 10 | 50 | 0 | 1.30 s |
| 25 | 125 | 0 | 3.09 s |
| 50 | 250 | 0 | 6.15 s |
| 100 | 500 | 0 | 12.76 s |

These timings come from a local, single-connection WASM database. They do not measure native connection-pool concurrency, Railway resources, production network latency, S3, or Expo. The high-concurrency latency is not acceptable evidence of launch readiness. A native staging rehearsal is required before estimating supported users. Raw results are in [launch-load-results.json](launch-load-results.json).

## Hosting follow-up

Backups and resource-monitor configuration were handled separately with the
user's approval. Private dashboard captures and account-specific audit details
are excluded from this public repository. Backup restoration and triggered
alert delivery remain unverified and are not implied by the test results here.

## Remaining launch gates

1. Run the native PostgreSQL regression, traffic rehearsal, and `pg_dump`/`pg_restore` check. The CI workflow is prepared but has not been pushed or run for this change. Native PostgreSQL could not start in the current execution environment, so it was not substituted for the PGlite results above.
2. Exercise an isolated staging deployment with the intended database resources, realistic data distribution, concurrent reads and writes, and deliberately slow external services. Record errors, p95 latency, pool waiters, queue age, CPU, memory, and disk. Proposed initial target: under one second p95 for ordinary reads at the expected launch load, with no lost or duplicated writes; measure first before choosing replica or pool settings.
3. Rehearse restoring a hosting backup into an isolated destination and check data and application access. Backup schedules and the first snapshot are confirmed; restoration is still untested. Define the acceptable recovery time and maximum data loss. Do not restore over production for this check.
4. Verify actual alert delivery and confirm an external monitor for `/health`, application queue-delay alerts, and crash reporting. Railway resource monitors and email/in-app delivery preferences are configured, but a triggered alert has not yet been exercised. Structured application logs alone are not an external alerting service.
5. After the approved backend release, reproduce affected private-photo requests with the new diagnostics. Confirm uploads, private reads, revocation, deletion, and temporary storage-failure recovery. Verify real push delivery, receipt handling, retry behavior, and token revocation on test devices.
6. Recheck the launch flows on devices: account creation/sign-in, verification, listing and Wanted creation, sharing/privacy, messages, exchanges, notifications, and account deletion. App Store review readiness is separate from these scaling checks.

## Running the prepared checks

From `server/`:

```sh
npm run test:privacy
npm run test:launch
```

The first command runs the privacy/reliability suites; the second runs the synthetic PGlite traffic and restore rehearsal. For a disposable native PostgreSQL cluster on a supported non-root environment with PostgreSQL tools installed:

```sh
PRIVACY_PG_BIN=/usr/lib/postgresql/16/bin npm test
PRIVACY_PG_BIN=/usr/lib/postgresql/16/bin npm run test:launch:local
```

The native runner creates a fresh loopback-only test database and generated test credentials, then destroys its cluster. It does not read production `.env` settings. The native restore script refuses an arbitrary destination. The targeted launch fixture does not represent the entire production schema; the full migration and API suite remains a separate gate.

## Release and rollback notes

- Backend changes and the mobile expiry-recovery action are queued with the welcome, onboarding, profile, and notification-icon updates. The user lifted the build hold and authorized this release on September 26. Native database CI must pass before merging to the Railway-connected main branch.
- Startup adds feed tables/indexes and rank queue triggers. Rehearse startup migrations against realistic data before release; index creation and the one-time rank reconciliation can delay startup. Existing active feed sessions may need a refresh after the backend changes.
- Budget up to 18 database connections per API instance with the defaults, plus migration/admin headroom. Check the database limit before adding replicas. `DATABASE_POOL_MAX` and `BACKGROUND_DATABASE_POOL_MAX` can tune the budget; `SCHEDULER_ENABLED=false` disables scheduled jobs in a process intended only to serve the API.
- Rollback uses the previous backend image and preserves the additive tables. Avoid dropping tables or triggers during incident response. If the old backend stays in use, account for queued rank entries and feed history because it does not run the new consumers/retention job.
- Conversation lists and exchange history still need pagination as usage grows. Storage expansion, multiple replicas, standalone workers, and native/staging load results remain outstanding. Railway backup and resource-monitor configuration was completed separately as recorded above.
