# Exchange and mutation audit — September 7, 2026

TestFlight is on hold. Backend fixes deploy through the normal reviewed main branch; mobile copy and interaction changes wait for the next authorized internal build.

## Observed production failure

Build 228's sale pickup returned HTTP 500 at 22:23:17 UTC. Runtime logs show PostgreSQL error 22P02: `given_away` was missing from the production `listing_status` enum. The exchange update had already committed; the listing update failed separately. A retry returned 404 because the first update had advanced the exchange.

The startup upgrade adds the missing enum value before using it. Its backfill repairs only active, unavailable sale/giveaway items with matching pickup/return timestamps, no later owner edits, and no other active reservation. Pickup and delisting now commit together. Repeated participant confirmations acknowledge the original handoff without changing its timestamps or notifying twice.

## Workflow findings and corrections

| Workflow | Failure addressed | Protection |
| --- | --- | --- |
| Pickup | Completed exchange with an item left active after a failed status write | Shared transaction, row locks, enum upgrade, retry acknowledgement |
| Approval | A repeat approval returned an error after the first succeeded | Owner-scoped retry acknowledgement; one reservation and notification |
| Decline | Declining another pending request released an existing reservation | Atomic decline; free pending requests do not release inventory |
| Cancel | Race against pickup or inventory-write failure | Existing atomic cancellation checked with rollback and race tests |
| Free return | Both participants could complete and count the same return twice | Locked state transition, one inventory update, retry acknowledgement |
| Pickup expiry | Scheduled expiry could overwrite pickup or revive a paused item | Conditional locked transition; availability and cancellation commit together |
| New listing | Failed photo or private-offer save left a partial listing | Listing, photos, preview setting, and requested offer in one transaction |
| Listing edit | Failed photo replacement could delete photos but retain other edits | Row lock and atomic field/photo update; explicit empty photo list works |
| New request | Preview-setting failure left a posted request behind | Request and preview choice commit together |
| Existing private offer | Availability/request can change during offering | Existing conditional upsert rechecks access and active state; remains one write |
| Chat send | Notification preparation could fail after message persistence | Acknowledge persisted message before best-effort notification work |
| Sent chat photo | Draft-cleanup failure could present a successful send as uncertain | Sent UI updated from acknowledgement; cleanup cannot offer another send |
| Verification reset | Handler wrote an unsupported `active` account status | Canonical `pending` status; administrator reset preserves suspension |

## Mobile cleanup

- Removed the review solicitation from shared exchange-completion guidance.
- Removed the chat's private-conversation explainer and persistent draft status label.
- Empty sent drafts are cleared; text typed during a send is retained.
- Exchange actions use an immediate shared guard while a request is running.
- A condition concern no longer produces a false “Return confirmed” success message.

## Verification

`tests/privacy/exchangeAtomicity.test.js` uses PostgreSQL-compatible PGlite SQL, a real legacy enum, and failing database triggers to check rollback, repair boundaries, permissions, notification failure, and retries. Existing screen tests cover chat recovery and exchange actions, including a new sent-photo cleanup-failure regression.

`tests/mutation-atomicity.test.js` runs through HTTP against the release job's disposable PostgreSQL/PostGIS database. It exercises concurrent confirmations, competing requests, cancellation races, expiry, photo/offer/request-write failures, and notification lookup failure. The startup migration rehearsal also casts current item, account, request, and condition values through the real enum types.

This is a targeted audit of current launch workflows, not a claim that every possible app/device failure has been eliminated. Historical Stripe settlement paths remain outside the free/offline-payment launch path and were not redesigned. Native device QA and real network interruptions still require TestFlight testing when uploads resume.
