# Build 228 app audit — September 7, 2026

## Status and scope

This is an inventory of all 70 screen source files plus shared overlays, navigation, API handling, notifications, signup, and supporting privacy pages. It is not a claim that every state has been exercised on a physical device. Screen-suite presence is not exhaustive coverage. Production remains build 227 until the release checks below are completed.

The user's design standard is warm cream surfaces, forest green actions, sage accents, existing illustrated icons, legible text, useful spacing, clear action hierarchy, and one purpose per control. No repeated Done/close actions, invented ratings, fake controls, unnecessary payment flows, or misleading privacy claims. Giveaways remain free. Distribution remains internal TestFlight only.

## Corrected in this change

- Require a delivered six-digit email code before email/password signup creates an account. Expiry, resend limits, attempt limits, failed delivery, replay and provider collision paths have automated checks. Apple/Google continue using their existing provider verification.
- Introduce sharing and privacy choices before town setup; distinguish friends, neighborhood, town, and private inventory without claiming verified residency.
- Use one bounded, scrollable themed confirmation card for alerts and return confirmations, with one close control and clear primary/secondary actions. Preserve explicit return confirmation and the separate message action.
- Remove return/giveaway rating prompts in new notifications and normalize historical Inbox copy while preserving links and read state. Hide retired rating activity and remove remaining visible rating readouts.
- Replace invented neighborhood invite codes and nonfunctional email invitations with the native text/share composers and the existing alpha invitation. Replace nonpersisted community toggles with the real notification settings page.
- Handle missing neighborhood IDs, load failures and retry; fix the corresponding notification navigation fallback. Prevent duplicate request submissions and allow retry after failure.
- Recover to sign-in on a confirmed expired/invalid current session. Parallel failures notify once; a late old request cannot sign out a newly authenticated account. This does not add token refresh or change session duration.
- Use local illustrated photo/avatar placeholders instead of requesting remote placeholder images. Failed images stop indefinite loading. Avatars no longer displace listing images from the small decoded-image cache. Actual refresh/tab image flashing still needs physical verification.
- Add scrolling/keyboard accommodation to constrained forms and onboarding/identity screens. Replace stray action, warning, info and payment-sheet colors with theme tokens; preserve payment-brand colors in inactive historical card UI.
- Add the actual Privacy Policy link in Profile; correct obsolete payment/rating/privacy copy and support contacts. Preserve earlier policy pages. Align website factual copy separately. This is not legal certification.
- Remove the unfinished Bundles route because its item-detail destination does not exist. Keep inactive legacy/payment code inaccessible from normal current flows.

- Add administrator report review with database history, mandatory decision notes, stale-review protection and explicit suspension confirmation. Existing reports remain available. Personal blocks are separate. Suspensions deny authenticated access and discovery; verification callbacks preserve suspensions. Deletion no longer fails because of report foreign keys.

## Verification evidence

- Full mobile run: **672 tests passed in 114 suites** (local, production-source components with mocked native/services).
- Isolated server privacy/service run: **133 tests passed in 13 files**.
- Static screen inventory found no enabled Pressable/HapticPressable/Switch without a handler. All mobile source files parsed; reference scan found no unbound identifiers.
- Added meaningful coverage for Community Members, Request Suggestions, Insights, expiry races, image failure, real native invitations, confirmation actions, and legacy notification copy.
- Required remote gates: full PostgreSQL/PostGIS API tests, migrations replayed safely, HTTP auth/privacy checks, and production iOS JavaScript export. See PR checks for completion; local isolated tests do not replace these gates.
- Browser visual review could not reach the local Expo preview (browser reported ERR_BLOCKED_BY_CLIENT). No visual pass or device pass is claimed.

## Open checks before App Store submission

| Area | Remaining evidence or work |
| --- | --- |
| Safety reports and objectionable content | Added an admin-only review queue with recorded dismissal, reopening, suspension and restoration; explicit profile safety rows and a chat safety entry. Content filtering and an operational response owner still need verification before submission. Apple's [user-generated content requirements](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) apply. |
| Real device layout | Exercise small iPhone, Max and iPad; large text and VoiceOver; keyboard/dates; confirmation sheets and empty states. Automated render tests do not verify pixels, native safe areas or gesture behavior. |
| Images | Repeat the reported refresh/tab/My Posts behavior on internal 228 and a slow connection; verify cached photos stay visible and signed-image authorization remains correct. Cold uncached loading is distinct from flashing existing images. |
| Signup and delivery | Fresh unused email, real delivered code, expiry/resend, restart, and inbox rendering. No real user inbox was messaged by the test suite. |
| Provider/native flows | Real Apple/Google callbacks, account linking/recovery, native identity verification, camera/cropping, chat-photo upload and permissions. |
| Notifications and exchanges | Two accounts: request → accept → message pickup → pickup → return → confirmation; real push on cold start and correct target; no rating prompt. |
| Privacy and operations | Confirm actual retention, vendor disclosures, privacy labels, support delivery and report response ownership. The source audit cannot certify legal compliance or operational response. |
| Deployment | Merge only passing checks; confirm Railway health and migration success; build from matching source; verify Apple processing and internal group. No external tester assignment or App Store submission. |

## Screen inventory

Every row received a source-level theme/purpose/navigation review. “Current” means registered/currently reachable; “Historical/gated” means retained payment or older branch UI rather than a promoted current feature; “Inactive” means not registered in the current navigation. Tests listed are screen suites, not proof of all states. Some registered onboarding screens are retained alternatives to the simplified introduction/town path.

| Screen source | Exposure | Screen suite |
| --- | --- | --- |
| `ActivityScreen.js` | Inactive | Present |
| `AddPaymentMethodScreen.js` | Historical/gated | Present |
| `BadgesScreen.js` | Inactive | Present |
| `BorrowRequestScreen.js` | Current | Present |
| `BrowseScreen.js` | Inactive | Present |
| `BundlesScreen.js` | Inactive | Present |
| `ChatScreen.js` | Current | Present |
| `CircleDetailScreen.js` | Inactive | Absent — inactive legacy screen |
| `CommunityLibraryScreen.js` | Inactive | Present |
| `CommunityMembersScreen.js` | Current | Present |
| `CommunitySettingsScreen.js` | Current | Present |
| `ConversationsScreen.js` | Current | Present |
| `CreateListingScreen.js` | Current | Present |
| `CreateRequestScreen.js` | Current | Present |
| `DamageClaimScreen.js` | Historical/gated | Present |
| `DisputeDetailScreen.js` | Historical/gated | Present |
| `DisputesScreen.js` | Historical/gated | Present |
| `EarningsScreen.js` | Historical/gated | Present |
| `EditListingScreen.js` | Current | Present |
| `EditProfileScreen.js` | Current | Present |
| `EditRequestScreen.js` | Current | Present |
| `FeedScreen.js` | Current | Present |
| `FriendsScreen.js` | Current | Present |
| `IdentityVerificationScreen.js` | Current | Present |
| `InboxScreen.js` | Current | Present |
| `InsightsScreen.js` | Current | Present |
| `InviteMembersScreen.js` | Current | Present |
| `JoinCommunityScreen.js` | Current | Present |
| `LendingCirclesScreen.js` | Inactive | Present |
| `ListingDetailScreen.js` | Current | Present |
| `ListingDiscussionScreen.js` | Current | Present |
| `MyCommunityScreen.js` | Current | Present |
| `MyItemsScreen.js` | Current | Present |
| `NotificationSettingsScreen.js` | Current | Present |
| `NotificationsScreen.js` | Inactive | Present |
| `OfferItemScreen.js` | Current | Present |
| `OnboardingScreen.js` | Inactive | Present |
| `PaymentFlowScreen.js` | Historical/gated | Present |
| `PaymentMethodsScreen.js` | Historical/gated | Present |
| `ProfileScreen.js` | Current | Present |
| `ReferralScreen.js` | Current | Present |
| `RentalCheckoutScreen.js` | Historical/gated | Present |
| `ReportIssueScreen.js` | Current | Present |
| `RequestDetailScreen.js` | Current | Present |
| `RequestSuggestionsScreen.js` | Current | Present |
| `RespondToDisputeScreen.js` | Historical/gated | Present |
| `SavedScreen.js` | Current | Present |
| `SetupPayoutScreen.js` | Historical/gated | Present |
| `SubscriptionScreen.js` | Historical/gated | Present |
| `SustainabilityScreen.js` | Inactive | Present |
| `TransactionDetailScreen.js` | Current | Present |
| `TransactionHistoryScreen.js` | Current | Present |
| `UserProfileScreen.js` | Current | Present |
| `WantedPostsScreen.js` | Current | Present |
| `auth/FindAccountScreen.js` | Current | Present |
| `auth/ForgotPasswordScreen.js` | Current | Present |
| `auth/LoginScreen.js` | Current | Present |
| `auth/RegisterScreen.js` | Current | Present |
| `auth/VerifyIdentityScreen.js` | Current | Present |
| `auth/VerifySignupEmailScreen.js` | Current | Present |
| `auth/WelcomeScreen.js` | Current | Present |
| `onboarding/OnboardingCompleteScreen.js` | Current | Present |
| `onboarding/OnboardingFriendsScreen.js` | Current | Present |
| `onboarding/OnboardingIntroScreen.js` | Current | Present |
| `onboarding/OnboardingNeighborhoodScreen.js` | Inactive | Present |
| `onboarding/OnboardingPlanScreen.js` | Historical/gated | Present |
| `onboarding/OnboardingTownScreen.js` | Current | Present |
| `onboarding/OnboardingVerifyScreen.js` | Current | Present |
| `onboarding/OnboardingWelcomeScreen.js` | Inactive | Present |

| `SafetyReportsScreen.js` | Current, administrator only | Present |
