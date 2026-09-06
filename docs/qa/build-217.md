# TestFlight 217 — September 6, 2026

Build 217 (1.0.0) compiled successfully and was submitted to Apple on September 6, 2026. Apple confirmed VALID / IN_BETA_TESTING. Uploaded September 6, 2026 at 21:12:16 UTC. EAS build: e6dbb091-9ed8-404f-9edd-3127fa2417cf. Submission: a4a7987f-0c3f-4c84-a93d-33672f62ac6e. Source: GitHub e32e50f5d88caa0555b3a7513ca298ff16c22303, whose CI passed in run 34059856042; Railway deployment bef0c221-d51d-4f2e-b52f-5e37d90623ab succeeded.

The earlier EAS artifact dbd4a68b-1d9f-48bf-9792-2099ca805bf5 was never submitted. The native rehearsal caught the posting-to-neighborhood return issue, and the corrected artifact above includes that fix.

## Changes

- Unverified members can preview opted-in Town listings and requests in their own town. The server returns an explicit preview containing item content and a hidden-identity placeholder. Names, profile IDs/photos, ranks, reputation, discussions, offers and contact actions remain protected. Existing friend/neighborhood permissions still apply.
- Existing posts keep their previous audience until their owner saves a Town selection in the new app. The chooser explains that Town members can preview the post and only verified members can see the poster's profile. Listings' private inventory and pickup-address rules are unchanged. User-entered photos and descriptions can still contain identifying information; this is not a guarantee of anonymity.
- Onboarding, Town setup, preview cards, details and verification screens explain: “Browse Town listings. Get verified to see who’s sharing.” Verification remains optional for browsing and required for posting to Town.
- Private photo URLs encrypt their source path, including uploader identifiers, inside a short-lived signed token. Photo access is checked again on every request; withdrawing sharing invalidates a previously issued preview URL. Existing signed URLs remain compatible until expiry.
- Entering Neighborhood or Friends from a posting form uses a matching modal presentation. The native rehearsal reproduced a blank screen when returning from a card pushed above a modal; the modal presentation fixes that return path.
- Shared popups use the iOS app-window overlay, removing the whole touch layer before running navigation callbacks. Android retains native modal/back handling. Neighborhood selection offers Join, Create and Not now; posting drafts survive navigation and membership refreshes on return.
- The large no-audience and match-notification cards have been removed from request creation. Relevant invite/join/verify actions live inside audience selection, and posting still prevents an empty audience.
- Other members' profiles have a themed More menu for reporting, blocking and unblocking. Blocking stops new DMs in both directions; previous conversations and borrows remain accessible. Reporting does not automatically block a member.
- Notification settings have eight controls for device push/sound, messages, borrowing, return reminders, post replies, friends/neighbors and item matches. GET/PATCH preferences now match the screen, save atomically and govern real push delivery. Failed loads/saves show retry feedback. Payment and broadcast controls are removed from settings. Activity excludes duplicate message alerts and retired dispute/promotion entries; messages retain their own unread count. Historical notification records are preserved.
- Activity links open relevant post discussions, neighborhood screens, profiles or borrow details. Mark-all-read takes one tap. A failed activity load does not claim that everything is caught up.
- The fee switch has a visible muted gray-green off track, a parchment thumb and a forest on track. Prices remain informational and arranged directly between the parties.

## Executed checks

| Check | Result |
| --- | --- |
| Full mobile regression | 568 tests / 104 suites passed, including smoke tests |
| Production iOS JavaScript export | Passed |
| Server regression on disposable PostgreSQL | 241 tests / 18 files passed |
| Privacy/auth unit checks | 74 tests / 6 files passed |
| PostgreSQL access-policy assertions | 53 passed |
| Real HTTP/SQL integration | 101 checks passed, including Town preview photo encryption and revocation |
| Runtime migrations | Fresh schema, legacy social-auth columns, private defaults and repeat execution passed |
| Native popup touch rehearsal | Passed on iPhone 17 Pro / iOS 26.5: three open/cancel cycles, global confirmation and error above posting, confirmation above a nested native modal, Join/Create navigation, draft return and final dismissal |

No production accounts, messages, listings, payments or identity sessions were created by these tests. Provider consent on real Google/Apple accounts, live ID verification and actual APNs delivery to a physical device remain separate alpha checks. The local push checks validate settings and routing, not delivery by Expo/APNs. Legacy Stripe sandbox tests are opt-in, as documented in ci.md.
