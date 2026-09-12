# Borrowhood simplicity audit

Date: 2026-09-11

Scope: current mobile navigation, screen logic, API contracts and existing tests, including the notification/exchange patch prepared for PR #30.

## Bottom line

The main borrowing flow is becoming clearer, but the app is not yet consistently simple. The remaining problems are mostly misleading outcomes and broken transitions, not a need for another visual redesign. Fix those before adding more features or removing useful safeguards.

This is a code-level audit, not a completed usability study or native-device accessibility sign-off. In particular, the biometric issue below is source-traced and needs a physical-device reproduction. Remaining findings are recommendations, not changes implemented by this audit.

## Existing patch: implemented, not deployed

- One approval location: the request queue. Pending exchange details and chat lead there.
- Inbox can show older updates and filter to unread activity; read controls are separate for Activity and Messages.
- Message-only unread activity selects Messages; one failed endpoint no longer blanks the whole Inbox.
- Push and Inbox destinations share one routing helper. Tapped alerts are acknowledged without clearing unrelated alerts; late badge responses are invalidated.
- Pickup alerts use wording appropriate for either participant. Welcome, cancellation and other alerts open consistent destinations.
- Home exposes Your exchanges, including due returns, pickup and requests to review. A previously broken return reminder now uses actual transaction fields.
- Either participant can confirm pickup, with a handoff confirmation. Message and cancel remain visible. Owners have a bottom-bar entry to their active exchange.
- Newly submitted borrow requests open their tracker. Swiping a post no longer immediately deletes it.
- Listing details prioritize an accepted/collected exchange over a newer pending request.

## Button-clarity follow-up

The subsequent UI pass makes secondary actions visibly outlined in Inbox, chat retries, draft controls, Home discovery links, exchange details, request queues, comments, request renewal and neighborhood member controls. A shared ActionButton provides a 48-point minimum target, wrapping labels, explicit disabled/loading states and a destructive-action color. Moderator promotion now has a visible text label. Existing confirmations and navigation behavior are preserved. This is a core-flow pass, not a claim that every legacy surface or native layout has been visually reviewed.

Verification for this follow-up: 126 mobile suites / 850 tests passed, including disabled/loading and long-label button tests; the production iOS JavaScript export passed. Still local, not deployed or submitted to TestFlight.

## Highest-priority remaining findings

### Follow-up: Inbox and neighborhood cover photo

Prepared locally after the source for build 242 was published:

- A full-width **Mark all as read** button stays above both Inbox tabs, including when counts are zero. One action marks activity and messages read, waits for all writes before refreshing badges, reports partial failure, and retains items arriving after the read operations.
- Moderators and creators have an **Add cover photo** / **Change cover photo** button on their neighborhood page. It opens the existing authorized editor with a crop/preview, labeled Change/Remove controls, and Save/Cancel. A successful save returns to the neighborhood, which reloads on focus. Regular members cannot open the editor through a route parameter. Upload failure preserves the saved image.
- Both use existing backend endpoints. These changes are not in the previously published build source; no new Expo build has been submitted by this session.
- Focused verification: 77 tests passed across seven suites covering Inbox, notification integration, badge refresh, neighborhood settings/overview, Profile, and rating details. The production iOS JavaScript export passed. Physical-device visual verification remains outstanding.
- Rating redesign reverted at the user's request: shared member summaries, both profile presentations, the rating sheet, and their tests match the original published source at `88ab670`. This restores the icon beside the name, stacked adjective/rank labels, original sheet styling, and original close control. All later rating-button and layout experiments are withdrawn. The Inbox and neighborhood cover-photo changes remain separate.
- Release dependency remains: the deployed backend at `7512143` returns endorsement percentage/count without the score expected by the published rank UI. For established members this can hide the rank entry. The matching backend ranking logic and tier alerts have not been deployed.

### September 12: whole-dollar entry and targeted profile changes

- Sale prices, daily fees, and listing price/deposit inputs now use a whole-dollar number keypad and whole-number placeholders. Decimal pastes are rejected without stripping the decimal point into a larger amount. Existing fractional prices are preserved unless edited; no stored prices or historical financial amounts are rounded.
- The user subsequently requested removing the exchange count from both profile headers and showing the rank beside the name. Profile headers now group the name, verification, and a labeled rank control in one centered row, with space reserved for the rank. Exchange counts remain in non-profile member summaries. Missing score data is labeled **Rank unavailable** rather than inventing a rank.
- The original rating sheet remains, with the requested hierarchy swap only: rank names (Outlaw, Squire, Archer, Ranger, Robin) are prominent, with their descriptions smaller underneath, including the current-rank summary. This supersedes the earlier blanket rating-UI revert only for these newly requested changes.
- Verification: 74 focused tests passed across seven price-entry, listing, profile, member-summary, and queue suites; the iOS JavaScript export passed. Native layout is not device-verified. These changes remain local and need a new release; the actual current rank still requires the matching backend data.

### September 12: Inbox controls and focused comment threads

- Inbox keeps Activity / Messages as its only tabs. Following the user's feedback about wasted space, **Unread only** and **Mark all as read** now live in the **•••** menu beside the Inbox title; the extra controls row is removed. An active unread filter is shown as a dismissible chip in that same title row. Filtering works in both tabs, with a **Show all** button when a filtered list is empty. Marking read still covers activity and private messages, including the existing partial-failure and new-arrival handling.
- Comments follow a flat conversation layout with avatars, inline names/times and readable messages. Long-press or open **••• → Reply in thread** to open a focused thread. The reply-count button reopens it; replies stay out of the main conversation. Back returns to Comments.
- The composer uses a rounded expanding message box with a green send button inside it, the native dark keyboard requested in the Slack reference, and no additional Done toolbar. Comment and thread drafts stay separate; failed sends retain their text. Earlier replies load with retry and pagination instead of being replaced by a newly sent reply.
- The approved composer is shared by public comments, thread replies and private chat, including the existing chat photo attachment action. All app text fields inherit the dark native keyboard; form-specific keypads and secure-entry behavior remain in place. Private chat retains its existing encrypted drafts and safe-retry handling.
- These changes are local. Generated design previews are concepts, not native screenshots; physical iPhone keyboard, large-text and long-press behavior still require device review before release.
- Verification: 77 tests passed across Inbox, comments/threads, private chat and shared text-input suites; the production iOS JavaScript export passed. This is not a TestFlight build or device sign-off.

P1 means fix before calling the experience release-ready. P2 means significant confusion or avoidable work in an otherwise usable path.

| Priority | What the person experiences | Evidence | Smallest useful correction |
|---|---|---|---|
| P1 | Chat offers **Report**, but tapping it does nothing. | `mobile/src/screens/ChatScreen.js:414–421` has an empty handler. | Open the existing safety-report flow with the correct person/context, confirmation and failure feedback. Never imply that a report was submitted when it was not. |
| P1 | Verification can say **Processing** on one screen and show a verified badge/lock profile fields on another. | `server/src/routes/auth.js:596` treats a grace period as `isVerified`; `server/src/routes/identity.js:172–178` separately returns confirmed verification. | Separate temporary access from confirmed identity. Use one consistent Processing state without weakening access checks. |
| P1 | **Change → Re-verify** cannot change a verified name/address. | `EditProfileScreen.js:203–216` opens `IdentityVerificationScreen.js:118–154`, which only offers Done to verified members; `server/src/routes/identity.js:29–30` rejects another session. | Offer an honest support-assisted correction path until secure re-verification exists. Do not simply unlock verified identity fields. |
| P1 | Clearing an existing description and saving appears successful, but the old text remains. Clearing an item category has the same problem. | `EditListingScreen.js:235–237` and `EditRequestScreen.js:120` send `undefined`; JSON omits it and the PATCH leaves the original value unchanged. | Send explicit empty/null values for intentional clearing and test persistence after reloading. |
| P2 | After adding a new item as a private offer, the user returns to an unfinished-looking chooser with no confirmation or new item. | `OfferItemScreen.js:29,58` loads once and opens CreateListing; `CreateListingScreen.js:365–373` sends the offer, then goes back to that chooser. | Finish at the request page with “Private offer sent.” Test the complete nested navigation path. |
| P2 | A newly sent friend request immediately says **Friends**, then becomes **Add Friend** when revisited. | `UserProfileScreen.js:54–68`; the server returns `status: 'pending'` from `server/src/routes/users.js:520`. | Display distinct Add friend / Requested / Friends states, using the server result. |
| Fixed locally | Replying to a collapsed comment thread previously hid earlier replies. | `ListingDiscussionScreen.js` now merges fetched replies with local sends and separates loaded/error state from cached content. | Covered by the focused-thread changes; native review remains pending. |
| P2 | A network failure looks like “nothing saved,” “no friends,” “no neighborhood,” or “not found.” | `SavedScreen.js:65–67`, `TransactionHistoryScreen.js:48–49`, `FriendsScreen.js:49–68`, `MyCommunityScreen.js:27–49`, `JoinCommunityScreen.js:41–56`, `UserProfileScreen.js:43–51`, `RequestDetailScreen.js:56–70`. | Reuse one concise failed-load treatment with Try again. Show empty states only after a successful empty response, and not-found only for a genuine missing record. |
| P2 | Editing a request requires typing `YYYY-MM-DD`, although creating it offers familiar date choices. | `EditRequestScreen.js:249–279` versus `CreateRequestScreen.js:315–345`; edit also marks optional Category as required. | Reuse the create date controls and shared validation. Remove the false required mark. |
| P2 | A request says “Visible for 1 week” but can disappear tonight; its detail page sends the owner elsewhere to renew. | `CreateRequestScreen.js:318,349`; `server/src/utils/requestState.js:1`; `RequestDetailScreen.js:180`; renewal defaults to one day in `server/src/routes/requests.js:413`. | Show the actual earlier end date. Put Renew directly on the expired request with an explicit duration/result. Preserve expiry and offer-access revocation. |
| P2 | Opening a new post can silently restore old content; Start fresh is buried in optional details. | Quiet `DraftStatus` returns nothing (`components/DraftStatus.js:6`); create-screen discard controls are inside optional sections. | Show a restored-only row: “Unfinished request restored · Start fresh.” Keep normal autosave quiet and retain discard confirmation. |
| P2 | Members after the first 100 cannot be found or moderated. | `CommunityMembersScreen.js:33,180–199` requests 100 with no search or load-more; the API supports pagination. | Add search/load-more and a truthful total. Preserve protections for self and other moderators. |
| P2 | Neighborhood navigation has avoidable dead ends: setting a town does not reload discovery; Join another is hidden for people with exactly one membership. | `JoinCommunityScreen.js:37–39,233–240`; `MyCommunityScreen.js:117–150`. | Reload on focus/location changes; always expose a labeled Join another neighborhood action. |
| P2 | Leaving a neighborhood can tell a member to delete listings when their ongoing exchange is the actual blocker. | `CommunitySettingsScreen.js:126–128` rewrites the server's combined listings/transactions error. | Explain the actual blocker and link to My Posts or the relevant exchange. Do not suggest deleting unrelated posts. |
| P2 | Face ID setup asks the user to sign out/back in, but the promised opt-in sheet belongs to the screen that authentication unmounts. | `ProfileScreen.js:359–367`; delayed sheet in `auth/WelcomeScreen.js:137–143`; auth navigation replacement in `RootNavigator.js:132–136`. | Put opt-in on a persistent authenticated screen with appropriate authentication. Confirm on a physical device; current test defaults mock biometrics unavailable. |
| P2 | Apple/Google members see Change Password and are asked for a current password they never created. | `ProfileScreen.js:296–300`; `auth/ForgotPasswordScreen.js:358–365`; passwordless social signup in `server/src/services/socialAuth.js:76–79`. | Show the actual sign-in method. Offer Change password only when applicable; any Add password path must retain email proof. |

Screen-only paths in the table are relative to `mobile/src/screens/` unless a full repository-relative path is shown.

## Smaller simplifications

- Put account-finding help on the default Welcome sign-in form. It currently lives on a secondary Login screen.
- Enable password-manager/new-password autofill during registration; consider moving the optional phone field to Profile.
- Recheck notification permission after returning from device Settings. The current settings screen only checks at mount.
- Use consistent user-facing words: **item**, **request**, **exchange**, **moderator**. Past exchanges currently calls everything “Borrowed from”/“Lent to,” including sales and giveaways. A pending request can say View request; an accepted one should say View exchange.
- Explain the access that moderator promotion grants. Its shield now has a visible action label; permissions are unchanged.
- Neighborhood invitations should use the actual navigation labels and say Join, not “ask to join” when membership is immediate.
- Show the consequential borrowing-duration default beside collapsed optional details, without exposing the entire advanced form.
- Match local title validation to the server's three-character minimum. Replace generic “Invalid value” failures with field-specific guidance.
- Align frontend/backend borrowing-day calculations across daylight-saving changes. The frontend uses calendar days; the backend rounds elapsed hours up.
- Simplify message retry wording without removing protection against duplicate sends. “Safe retries need the updated server” should not become a task for an ordinary member to interpret.

## What to keep

- Existing five-tab navigation, woodland icons, parchment/green palette and layered cards. There is no evidence that a wholesale redesign would solve these problems.
- Short active onboarding: two intro pages, town/state, then the app. Paid plans and legacy onboarding steps are not required in the current launch flow.
- Home search, labeled Post action, clear post types and sticky item actions.
- Optional request photos, date presets, encrypted/account-scoped drafts and unsaved-edit protection.
- Explicit audience choices and one-item private-offer consent. Fewer controls must not mean accidentally sharing more.
- One approval queue. Exchange details explain pickup/return; chat preserves the exchange context.
- Confirmation for deletion, cancellation, member removal and actual handoff. Simplicity should reduce uncertainty, not remove safeguards.
- Separate user/moderator/admin experiences. Admin safety-review controls are intentionally more detailed than ordinary member screens.

## Coverage and verification

Reviewed active navigation and the principal flows for authentication/recovery, current onboarding, Home/search/filtering, Saved, My Posts, all create/edit forms, borrow requests, private offers, queue/exchange details, chat/comments, friends/profiles, neighborhood discovery/membership/settings/invites, notification settings, history, and administrator entry points. Relevant server contracts and tests were checked for the findings above.

Legacy/unlinked screens (including old onboarding, standalone notifications/activity, circles/bundles and other disabled extras) were separated from current user journeys. Payment/subscription controls are disabled for the current launch; historical payment routes were not mistaken for required onboarding. External Apple/Google/Stripe dialogs were not exercised live.

Current implemented patch verification:

- 125 mobile suites, 845 tests passed.
- 20 isolated API suites, 212 tests passed, including real-route PGlite coverage.
- Production iOS JavaScript export passed.
- Account audit additionally ran 12 relevant suites, 105 tests; these overlap the full mobile suite and are not an additional total.
- The broader PostgreSQL integration suite cannot run under this workspace's root-process restrictions. Previous CI exposed four outdated expectations; the patch updates them to the established queue and opted-in Town-request contracts while retaining privacy assertions. Hosted CI must verify those updates.
- Native capture cases were added for Home exchanges, message-only Inbox, owner pickup and owner active-item controls on small/large iPhones. New native screenshots and real-device large-text/VoiceOver/keyboard flows are not visually signed off here.
- Handoff: the patch and audit are committed locally. GitHub write calls failed with a connector serialization error; PR #30 still points to its earlier commit. Nothing from this batch has been deployed or submitted to TestFlight.

A suspected missing Alert import in Withdraw offer was ruled out: the import exists at the end of RequestDetailScreen. It is not an audit finding.

## Recommended next pass

1. Fix no-op actions, contradictory account state, ineffective correction/setup paths and false-success saves.
2. Finish transitions: create-and-offer, request renewal, comment replies, pending friendship and return from Settings.
3. Apply consistent loading/error/retry states and reachability to remaining screens, including member pagination.
4. Reuse form controls and simplify vocabulary; retain privacy and destructive-action confirmations.
5. Walk the actual app on a small iPhone with large text and a fresh account, then repeat with poor connectivity and an established account. Require each primary task to be understandable without coaching before declaring it simple enough.
