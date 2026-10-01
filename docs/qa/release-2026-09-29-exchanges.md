# September 29 exchange-tracking update

The user approved pushing the current branch and submitting a TestFlight build.
This release does not submit the app for production App Store review.

## Included

- A central Your exchanges screen groups active exchanges into Needs you,
  Ready for pickup, Borrowing & lending, and Waiting. Each item shows the
  neighbor, current status, return date when applicable, and the next step.
- Feed, My Posts, Inbox, Profile, and the general return-help screen open the
  same tracker. History remains separate; completed exchanges do not clutter
  the active tracker. Incoming owner requests retain the grouped approval queue.
- Statuses refresh on focus, foreground notifications, app resume, and pull to
  refresh. Failed refreshes retain confirmed data, and account changes discard
  previous-account results and in-flight responses.
- Branded hat pull-to-refresh on iOS uses native refresh behavior and respects
  Reduce Motion. Android retains its native swipe indicator.
- Main headings use bold DM Sans. The feed backdrop extends to the top edge.
  The normal Profile Return help entry is removed; return assistance within
  exchanges and administrative return reviews remain available.
- Privacy identity-verification wording describes Stripe confirmation.
- Static app illustrations, biometric artwork, and reaction controls use the
  Borrowhood icon system. Message reaction values remain compatible with the
  server and existing conversations.

## Verification Before Push

- All 154 mobile suites passed: 1,468 tests, including smoke tests, notification
  routing, authenticated cold-start taps, unread badges, and exchange workflows.
- All 41 isolated server privacy suites passed: 527 tests. These include durable
  notification delivery, preferences, account isolation, reminder scheduling,
  grouped unread counts, and atomic request/pickup/return behavior.
- Return-help date fixtures use local calendar dates. Explicit coverage includes
  return-request, pickup-review, date-extension, and return-case notification
  destinations, plus tracker app-resume and hidden-screen behavior.
- Production iOS JavaScript and assets export successfully.
- Native PostgreSQL/API/migration and concurrent-traffic/backup checks passed
  in the initial release run. CI exposed a cold-render timeout in the first feed
  assertion; it now uses the existing five-second asynchronous render allowance,
  without changing its content or duplicate-overview assertions. The first
  discussion-screen assertion uses the same allowance.
- The earlier browser verification checked the actual exchange screen at widths
  320, 393, 768, and 1180, navigation from the feed to exchanges and history,
  and the empty-state route back to the feed.
- The guarded TestFlight workflow must repeat the full mobile suite and iOS
  export, native PostgreSQL/API/migration checks, concurrent traffic and backup
  restoration, and the signed-archive payment-framework audit before submission.

## Device Checks Still Required

Automated tests mock Expo push transport; they do not prove delivery through
Apple Push Notification service. On the installed TestFlight build, use two
accounts to check request, approval, message, pickup, return request, and return
confirmation notifications in foreground, background, and cold-start states.
Confirm each tap opens the affected exchange or conversation and updates badges.
Also check the native pull-to-refresh animation and Reduce Motion on an iPhone.

No server changes are included relative to main, so this client update does not
require a new backend deployment.
