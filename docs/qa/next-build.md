# Release notes — September 26, 2026

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
