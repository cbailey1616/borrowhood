# Next build after 217 — pending release

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

This batch is prepared separately from released build 217. It has not been submitted to TestFlight.
