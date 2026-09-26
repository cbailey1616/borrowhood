# Onboarding refresh — September 26, 2026

The normal setup path now collects name/town, offers neighborhood membership,
and offers identity verification. Neighborhood membership and verification are
optional. The user authorized pushing this work and creating a TestFlight build
on September 26; the earlier build hold is lifted.

## Changes

- Shared Borrowhood layout, themed vector scenes, DM Sans headings, accessible
  three-segment progress, and back navigation. Numeric step labels are removed.
  Content and actions scroll together on short screens or with large text.
- Step one: “Let’s find your town.” / “See what’s being shared near you.”
  Prefilled name and manual town/state remain available, with an optional
  current-location action and native state picker. Verified fields are locked.
  Coordinates are not sent with the profile update.
- Step two: discover neighborhoods using the saved town/state, choose one to
  join, create one, or select Not now. A true empty result says “No neighborhoods
  nearby yet” and offers Create a neighborhood. Failed discovery offers Retry.
  Successful joins/creation survive a later progress-save error without a
  duplicate join/create when continuing again.
- Step three: optional Stripe identity verification, a green action with the
  official purple Stripe wordmark, and a “What does verification unlock?”
  comparison sheet. All footer wording below Not now is removed. No change is
  made to backend identity-data retention or the configured payment mode.
- Verification distinguishes processing from verified. Browser cancellation
  does not complete setup; Not now explicitly does. Existing offer, purchase,
  restore, and paid-mode disclosures are preserved.
- Incomplete accounts resume at their saved step; legacy steps 3–5 resume at
  verification. Completed accounts keep the existing main-app path. Late async
  results after navigation/account changes are ignored.

## Verification

The local full mobile run executed 1,368 tests: 1,366 passed and two stale text
expectations failed. Both expectations were updated and all 27 tests in the two
affected suites passed on rerun. The onboarding suites cover town validation,
optional location, progress errors, join/create retries, discovery failures,
verification cancellation/status, skip, duplicate actions, and resume routing.
The production iOS JavaScript/assets export and whitespace checks passed.
The final committed revision must also pass the cloud release checks.

The signed build and TestFlight submission are authorized and pending the
release pipeline. The visual supplied in the conversation is a design mockup,
not a device screenshot. Native review remains: iPhone SE and large text,
keyboard scrolling, VoiceOver progress/actions, safe areas, state picker,
neighborhood creation, and the real Stripe browser return.

## Promotional capture preparation

The existing fictional member portrait changes and My Posts fixture refresh
are now carried on this branch with a ninth native scene, My Neighborhood.
It uses the actual screen with offline sample membership, chat summary, shared
items link, and announcement. A separate Neighbors capture reuses the same
fictional portraits. Only the opt-in screenshot target consumes these fixtures.

The September 26 promotional review ZIP was truncated. Its replacement and
smaller iPhone/iPad packages were closed, reopened, and CRC-checked before being
saved. All 18 PNG exports passed dimension, RGB, and unique-hash checks. The
sixth promotional design is an SVG neighborhood concept pending native capture;
the first five use the previously prepared React Native Web review captures.
These remain review materials and have not been submitted to App Store Connect.
