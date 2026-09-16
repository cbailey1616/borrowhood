# Navigation audit — September 15, 2026

Status: fixes and automated validation complete locally. No push, native build, TestFlight submission, or deployment. Physical-device gesture checks remain open.

## Scope and evidence

The source inventory follows local JavaScript imports from `App.js`: 157 reachable modules, 66 screen registrations, 405 touch-control declarations, and 200 navigation calls. Sixteen calls choose their destination dynamically and were reviewed through their destination helpers and callers. Static checks found no unresolved literal routes or missing literal required parameters after the fixes.

These counts describe source coverage, not 405 independently exercised device interactions. The inventory does not prove hit testing, native swipe behavior, runtime parameter values, or server authorization. Run it with `node mobile/scripts/audit-navigation.cjs` from the repository root.

Reviewed areas: welcome/onboarding and account recovery; main tabs and feed entry points; item/request details, queues and exchanges; Inbox, conversations and comment threads; profile, friends and neighborhood links; forms, modal headers, action sheets, photo viewers and swipe actions. Dynamic notification, error-recovery, verification, tab and conversation destinations were checked against registered routes.

## Confirmed fixes

| Problem | Change |
| --- | --- |
| Queue Back was unreliable | The preceding queue fix provides an independent header button and a My Posts fallback when there is no previous route. |
| Opening another entity could reuse the current detail route | Item, request, exchange, profile, queue and chat routes now have entity identities; real stack-router regressions verify history and same-entity reuse. |
| A delayed operation could navigate after the user left | Shared task guards invalidate navigation on blur, unmount and entity changes. Applied to create/request flows, messaging entry points, deletes/cancellations, private offers, neighborhood changes, registration and verification. |
| Town verification discarded the original navigation context | Completion returns to the previous screen instead of popping to Home. Late verification-session responses cannot launch Stripe after leaving. |
| An inactive comment thread could block navigation elsewhere | Thread Back interception only applies while that screen is focused. |
| Password-reset swipe/Android Back skipped internal steps | Native removal follows the same step-back behavior as the visible arrow; successful reset releases the guard before returning to Login. A late code response cannot reopen a step the user left. |
| Repeated Back/swipe attempts queued discard prompts | Only one unsaved-change prompt opens at a time. A stale discard callback cannot navigate from another screen, and a background save does not pop the foreground screen. |
| Unedited item forms could show a discard warning | Automatic neighborhood updates are excluded from user-edit detection. |
| Returning from setup showed stale choices | Private offers reload inventory on focus; neighborhood discovery refreshes after editing profile location. |
| Sheet headings/handles appeared draggable but did nothing | Downward heading drags dismiss action/rank sheets through their existing close paths. Rank-list scrolling remains separate. |
| Custom modal headers ignored updated titles | Headers read the current navigation options. |
| Messaging an owner lost the item context in an existing chat | Existing-conversation navigation now retains the item information. |

Two dormant screens also had wrong parameter names corrected: Badges → Profile and Community Library → Item. Community Library's My Posts link now targets the registered nested tab.

## Validation

- Full mobile Jest run: **136 suites, 1,006 tests passed**. This includes existing queue, tab, modal, swipe-delete, notification destination, form and screen coverage, plus the new navigation regressions.
- Regression coverage includes real React Navigation 6 stack transitions, stale asynchronous completions, verification return paths, thread/native Back interception, password-reset success and backtracking, neighborhood refresh, unsaved edits, and heading-drag thresholds.
- Offline production JavaScript/Hermes exports passed for **iOS and Android**. These are bundle checks, not native application builds or physical-device tests.
- `git diff --check` passed.
- No backend code changed in this audit; the earlier notification/server results are recorded separately in `RELEASE_CHECKLIST.md`.

## Remaining device checks before release

| Interaction | Required check |
| --- | --- |
| Queue navigation | Open from My Posts, Inbox, an item and chat. Tap Back and edge-swipe during loading, errors and normal content. Confirm the originating screen and scroll position. |
| Detail history | Visit two different items, profiles and conversations, then go Back. Check identity, content and drafts belong to each screen. |
| Threads and password recovery | Compare header Back, iOS edge-swipe and Android Back. Each should exit one internal step; cancellation should not lose a draft. |
| Forms and slow requests | Start a request/save/message/verification on a slow connection, leave, and return. Check that no delayed result pulls navigation away. Test both Keep editing and Discard changes. |
| Sheets and photos | Drag headings, scroll content, use close buttons, tap backdrops and use Android Back. Cancel a destructive action. Check photo paging does not compete with screen Back. |
| Keyboard and accessibility | Test with the keyboard open, larger text, VoiceOver/TalkBack, a small iPhone, iPad rotation and split view. Confirm controls remain reachable and content is not covered. |
| Notification entry | Test foreground/background/terminated entry to a thread, exchange and queue; check Back and deleted-content recovery. Live delivery remains part of the notification device checklist. |

Payment and paid-tier entry points remain feature-gated. Their native payment flows were not exercised. `BundlesScreen` still references an unregistered `BundleDetail`, but neither is connected to the current app's reachable screen graph; enabling that feature requires a separate route review.

## Recommended next audits

1. Exchange state transitions under concurrency: overlapping requests, competing approvals, cancellation races, pickup/return confirmation and duplicate endorsements.
2. Authorization and privacy across towns, friends, neighborhoods, private offers, threads and blocked accounts.
3. Offline recovery and duplicate prevention for sends, uploads, posts and retries.
4. Account switching, expired sessions, drafts, caches and notification ownership.
5. Physical-device layouts, accessibility and native push delivery.
