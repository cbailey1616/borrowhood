# TestFlight 216 — September 6, 2026

Build 216 (1.0.0) finished native compilation and is confirmed VALID / IN_BETA_TESTING in App Store Connect. EAS build: 0f5e42d4-bfe9-4b66-9a31-7335b3d7ba96. Submission: bd2ad12e-b2f3-4b61-8841-d1aafcf43101. Uploaded September 6, 2026 at 19:38 UTC.

## Changes

- Authentication explicitly says **Sign up or sign in**, with distinct email creation and login options. Email login says **Welcome back**; linking says **Connect your account** and requests the existing Borrowhood password once.
- Starting another provider clears the previous linking credential, password and explanation. Cancelling Google cannot leave an unfinished Apple link selected.
- Apple and Google buttons use matching widths, 52-point heights and rounded outlines. Official provider logos are preserved; the Google font is bundled as a small licensed Latin subset.
- Town setup offers a native iOS state wheel with dark text on parchment. Location fills both town and state; full state names are displayed and canonical state codes are saved. Permission denial leaves manual setup usable.
- Friends has two primary tabs and one Add friends menu for contacts, search and text invitations. Empty states and avatar fallbacks use the woodland theme. Contacts are accessed only after the relevant action; stale searches cannot replace newer results.
- An empty, unfiltered home feed offers List an item and Ask for something, without competing filters or a neighborhood-join banner. Posting still uses the existing audience selection and permissions.
- My Posts has clearer forest outlines on its shared segmented control and a solid forest Add an item button.
- Either participant can cancel an approved borrow before pickup. A themed confirmation offers Cancel borrow or Keep borrow. Pending borrowers retain cancellation; pending owners retain Approve/Decline.
- Both cancellation API aliases enforce participant identity and current pickup state, handle retries once, preserve other reservations and notify the other participant. Free borrows retain payment status `none`. Free approval reserves the listing atomically; a pickup cannot overwrite a cancellation that completed first.

## Executed checks

| Check | Result |
| --- | --- |
| Full mobile Jest regression | 552/552 tests; 102/102 suites passed, including the 21 smoke tests |
| Provider switching and linking | Apple-to-Google switching, cancellation, provider-specific submitted credential and explicit sign-in/creation wording passed |
| Town setup | Location fills both fields, full-state normalization, state wheel selection, empty selection, permission denial, missing name and failed saves passed |
| Friends and first-use feed | Menu dismissal before navigation, deferred contacts permission, search, return navigation and both posting routes passed |
| Borrow cancellation UI | Owner and borrower at approved/paid states; confirmation, Keep borrow, and hiding cancellation after pickup passed |
| Isolated server regression | 196/196 assertions; 13/13 test files passed |
| Privacy and auth regression | 74/74 tests; 6/6 files passed |
| PostgreSQL access checks | 53/53 passed |
| Real HTTP and SQL integration | 96/96 passed, including both cancellation aliases, both participants, past borrow dates, unauthorized requests, retries, correct notification recipient, giveaway cancellation, retained reservations, and concurrent pickup/approval |
| Migration rehearsal | Production-style missing social columns, repeat startup migration and protected legacy listings passed |
| iOS JavaScript export | Expo production iOS export passed; this is a bundle check, not a signed native build |

All database checks used a fresh loopback PostgreSQL cluster. No real users, messages, listings, payments or identity sessions were created by these tests. A test cleanup fix removes synthetic request notifications before deleting their sender records.

## Device checks still pending

- Real Google/Apple consent, one-time connection with an existing Borrowhood password, and subsequent passwordless login.
- State wheel appearance, button layout, keyboard behavior and accessibility on small and large iPhones.
- Cancel an approved borrow from each party's device; verify the notification and refreshed feed/history.
Native compilation with the newly added Expo-compatible picker dependency passed in build 216.

The broader external-service checks in [build-215.md](build-215.md) remain pending unless separately confirmed. Existing paid Stripe settlement is preserved but was not exercised against Stripe. Regular borrows do not automatically expire for a missed pickup; this change supplies explicit cancellation.
