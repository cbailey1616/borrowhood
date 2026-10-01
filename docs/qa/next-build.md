# Release notes — September 26, 2026

## Held for the update after 272

The user asked to rename the neighborhood moderator role, then approved a
handoff policy for leaving neighborhoods. Hold both changes for the next update.
The user-facing name is **Steward**. Badge labels, promotion confirmations,
rejoin approval messages, accessibility labels, and neighborhood permission
errors use the new name. The stored role remains `organizer`.

Leaving a neighborhood now follows these rules:

- If another active steward remains, the steward can leave normally.
- The last steward must choose a current, non-suspended neighbor before leaving
  a populated neighborhood. Nothing selects a replacement automatically.
- The final neighbor sees an archive confirmation. Leaving archives the empty
  neighborhood, hiding it from discovery and preventing new joins; it does not
  delete its records.
- Promotion, departure, and the replacement's notification are one transaction.
  A failed handoff leaves the original membership and roles intact. Existing
  active-listing and active-exchange restrictions still apply.

The replacement picker pages through eligible neighbors. Confirmation says
“Make steward & leave.” An unavailable replacement refreshes the choices, and a
failed request can be retried. Notification preferences remain respected.
This policy applies to **Leave Neighborhood**; account deletion and administrator
account actions are outside this change.

The user approved saving `feature/steward-handoff-next-update` to the existing
Borrowhood GitHub repository and opening a held draft PR on September 26. This
includes the earlier `copy/neighborhood-steward-next-update` wording change.
The release hold remains: keep these changes out of production and new TestFlight
builds until the user requests the next update.
Validation: all 1,404 mobile tests across 148 suites and all 499 server privacy
tests across 39 suites passed. The production iOS JavaScript/asset export and
changed server JavaScript syntax checks passed. These include the focused 56
mobile and 43 membership/notification checks. Native PostgreSQL regressions for
concurrent departures and handoffs run in the PR checks, alongside the full server
suite, migrations, traffic rehearsal, and backup restoration. Check the draft PR's
CI results before release.
Build **1.0.0 (272)** was uploaded September 26 at 18:40 UTC before this change.
The notes below describe previously released batches.

Before releasing, check on a device: cancel a handoff, finish a selected handoff,
open the successor's alert, leave while another steward remains, and confirm the
last-neighbor archive. No new TestFlight binary is requested for this draft.

## Earlier September 26 release

The user authorized pushing the complete queued batch and creating a TestFlight
build on September 26. The earlier build hold is lifted. The cloud workflow
selects an unused build number from EAS history; the latest confirmed earlier
submission was build 269. See [the current release manifest](release-2026-09-26.md)
for this batch. The build-217 notes below are retained as historical context.

## Historical batch after build 217

## Town posting without identity verification

Authenticated, non-suspended members with a town and state can create or edit Town items and requests without verification, a paid plan, friends, or neighborhood membership. New drafts default to Town when that location is present. Restored drafts and existing private posts keep their saved audience.

Verification remains a viewer requirement for seeing identities through Town. Unverified viewers receive anonymous previews; verified viewers see the poster's real profile and actual verification status. An unverified poster does not receive a verified badge. Existing accepted-friend and neighborhood access remains unchanged.

Posting screens no longer redirect Town selections into verification. Verification copy explains the identity and badge benefit. Missing town/state produces a location message. Suspended members and unauthorized edits remain blocked.

## Approved icon

New Robin Hood hat and honey feather on parchment, plus matching launch-screen and verification branding. Both Expo configuration and the tracked native iOS assets are updated. See `mobile/design/brand/README.md` for source/export details.

## Validation

- 50 mobile tests passed across the eight affected component/screen suites.
- 74 privacy unit checks passed.
- 259 server tests passed across 19 files, using a disposable local PostgreSQL database and blocked external services. Includes 18 new real HTTP tests for unverified Town posting and viewer-specific privacy.
- PostgreSQL policy, HTTP/privacy, and repeat-migration checks passed through the isolated server runner.
- Production iOS JavaScript/asset export passed.
- Xcode compiled the launch storyboard and native app icon asset catalog without errors or warnings. Icon dimensions, opacity, transparent exports, and Expo/native asset parity passed.
- Native app icon and launch-screen changes still require the next compiled binary for on-device acceptance.

## Test on the next build

1. Sign in as an unverified member with a town/state but no friends or neighborhood. Create both an item and a request for Town. Neither should ask you to verify.
2. Edit an existing post and select Town along with another valid audience. Save, reopen, and check the selections.
3. Use a second unverified member in that town: see the post but no poster identity. Use a verified member: see the poster, with no verified badge if the poster is unverified.
4. Confirm a private item and a post from another town do not become visible.
5. Check the new home-screen icon, cold-launch mark, and verification-sheet branding.

These notes describe the historical batch originally prepared after build 217;
they are not the status of the current TestFlight submission.

## Onboarding and neighborhood promotion — September 26

Onboarding now follows town/name, optional neighborhood join/create, and optional
Stripe verification. It includes themed illustrations, a three-part progress
indicator without numbers, retryable errors, and resumable progress. Town entry
retains manual entry, the native state picker, and optional location permission.
The promotional screenshot setup now includes My Neighborhood and consistent
fictional member portraits.
See [the onboarding review](onboarding-refresh-2026-09-26.md) for validation and
the remaining native visual checks. This work is approved for the release.

## Sign-in layout — September 26

The main sign-in screen now follows the user's GitHub reference: visible email/password fields, password recovery beside the label, a green Sign in button, then Google and native Apple controls below a divider. Borrowhood's hat logo and parchment palette remain, with a compact Face ID option for returning members. Registration and password recovery return to this same layout. See [the sign-in review](sign-in-layout-2026-09-26.md) for the 32 passing checks and remaining device visual checks. Approved for this release.

## Launch reliability work — September 26

Bounded feed paging, isolated background database work, incremental rank updates, database-aware health checks, private-photo diagnostics, and expired-feed recovery are approved for this release. See [the launch readiness review](launch-readiness-2026-09-26.md) for executed tests and remaining staging, backup, and alert checks. CI must pass before merge and the signed build.
