# Borrowhood theme audit — September 25, 2026

## Result and scope

Completed a source and style audit of all **68 screen modules** and **65 existing shared components**, then added one reusable action-row component. There are **58 directly registered screens** and **10 additional screen modules** in the repository; both sets are included below. This is a source audit with targeted rendered review, not an assertion that every native screen and state was visually exercised.

Starting source: `main` at `d99926e4b1986c5c362e05d4f65d86170cd29112`.

The approved direction is warm parchment, cream cards with restrained depth, forest-green primary actions, red consequential actions, friendly existing icons, readable regular-weight text, and compact secondary rows. Work is on `fix/return-screen-theme-audit`.

## Confirmed findings and fixes

| Finding | Fix |
| --- | --- |
| The exchange's Report an issue action looked like body text. | Filled red 52-point button with a flag icon, preserving the existing issue sheet and messaging flow. |
| Return help gave every action equal emphasis and led with a policy paragraph. | Layered item summary; green extension card; red-accent report card; compact back/refresh controls; report empty state; expandable restrictions details. |
| Repeated flat panels drifted from the newer feed and inbox treatment. | Added `CARD_SURFACE`, reused by LayeredCard and 22 screen modules, plus shared pending-request and chat exchange cards. Existing colors and semantic accent backgrounds are retained. |
| Retry, restore and safety actions sometimes appeared as unbounded text. | Shared outlined/filled ActionButton variants now cover member/settings/history/friends/insights retries, profile photo/safety controls, verification retry/restore, and administrative report actions. |
| Some consequential actions used inconsistent fills. | Exchange reporting, pending-request cancellation, circle leaving and safety suspension have red filled actions. Existing confirmations still apply. |
| `title2`, `title3` and `caption2` were referenced without definitions. | Restored all three typography tokens. The initial scan found 17 references across screens/components; the final source scan found no undefined top-level theme-token references. |
| The notification and exchange page showed different due dates. | Calendar-day parsing preserves the agreed date for date-only strings and API midnight-UTC serialization. Exchange guidance, pickup/return labels and return-help due dates use it. Event timestamps retain normal timezone conversion. |
| The owner's item summary said Borrowing. | It now says Lending for an owner viewing a loan. |

## Verification

- Full mobile regression: **143 suites, 1,287 tests passed** after the shared-component changes.
- Focused exchange-screen regression after the final spacing adjustment: **52 tests passed**.
- Calendar-date regression in `America/New_York`: **9 tests passed**, including a daylight-saving date.
- Production iOS JavaScript/Hermes export: successful.
- Source parsing and `git diff --check`: passed.
- Isolated React Native Web renders of the two redesigned screens at **393 × 852** and **320 × 740**: no horizontal overflow. Confirm return and Report an issue measured 52 points high; return-option rows measured at least 76 points high.
- Screenshots below render the actual screen/component source with synthetic exchange data. Native-only navigation, haptics, modal and date-picker adapters are substituted for this layout review. These images are not native iOS screenshots.

### Rendered review

[Exchange screen](theme-audit-2026-09-25/exchange-web.png) · [Return-help screen](theme-audit-2026-09-25/return-web.png)

Native iPhone/iPad review remains necessary for Dynamic Type, VoiceOver, native sheets/date pickers and device scrolling. No new TestFlight build was uploaded as part of this audit.

## Screen-by-screen coverage

“Registered” means directly registered in the current navigators, including Inbox's render callback. Other modules are audited as existing source; this does not establish that a production route currently reaches them. A theme audit also does not certify unrelated navigation or business logic.

| Screen module | Navigation registration | Audit outcome |
| --- | --- | --- |
| ActivityScreen | Not directly registered | Reviewed theme tokens, action hierarchy, spacing, and loading/empty/error presentation. |
| BadgesScreen | Not directly registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| BorrowRequestScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| BrowseScreen | Not directly registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| BundlesScreen | Not directly registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| ChatScreen | Registered | Restored missing heading token; shared exchange card surface and safety controls. |
| CircleDetailScreen | Registered | Existing bordered member/item rows and icon actions reviewed. |
| CommunityChatScreen | Registered | Wrapper reviewed through CommunityChat and shared messaging components. |
| CommunityLibraryScreen | Not directly registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| CommunityMembersScreen | Registered | Explicit retry and neighborhood navigation buttons. |
| CommunitySettingsScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| ConversationsScreen | Registered | Existing layered conversation rows and empty state reviewed. |
| CreateListingScreen | Registered | Reviewed theme tokens, action hierarchy, spacing, and loading/empty/error presentation. |
| CreateRequestScreen | Registered | Reviewed theme tokens, action hierarchy, spacing, and loading/empty/error presentation. |
| DamageClaimScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| DisputeDetailScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| DisputesScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| EditListingScreen | Registered | Reviewed theme tokens, action hierarchy, spacing, and loading/empty/error presentation. |
| EditProfileScreen | Registered | Outlined photo-change button with camera icon. |
| EditRequestScreen | Registered | Reviewed theme tokens, action hierarchy, spacing, and loading/empty/error presentation. |
| FeedScreen | Registered | Restored missing heading token; existing LayeredCard uses the shared surface. |
| FriendsScreen | Registered | Outlined retry action; shared layered cards. |
| IdentityVerificationScreen | Registered | Shared verification retry/restore controls now visibly outlined. |
| InboxScreen | Registered | Existing layered notification/message cards, unread hierarchy and actions reviewed. |
| InsightsScreen | Registered | Raised metric cards and a separate retry button. |
| InviteMembersScreen | Registered | Raised invitation action card. |
| JoinCommunityScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| LendingCirclesScreen | Registered | Shared card surface; filled red Leave action and 44-point Join/Leave targets. |
| ListingDetailScreen | Registered | Existing item cards and visible request/edit/delete actions reviewed. |
| ListingDiscussionScreen | Registered | Composer, contextual item card and thread controls reviewed. |
| MyCommunityScreen | Registered | Existing layered neighborhood cards and compact action rows reviewed. |
| MyItemsScreen | Registered | Existing layered item cards, semantic actions and empty states reviewed. |
| MyQRCodeScreen | Registered | Existing layered QR card and filled share action reviewed. |
| NotificationSettingsScreen | Registered | Shared card surface and distinct retry action. |
| NotificationsScreen | Not directly registered | Reviewed theme tokens, action hierarchy, spacing, and loading/empty/error presentation. |
| OfferItemScreen | Registered | Existing bordered item rows, photo placeholders and action chevrons reviewed. |
| OnboardingScreen | Not directly registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| PrivacySafetyScreen | Registered | Existing layered disclosure cards and grouped links follow the common theme. |
| ProfileScreen | Registered | Existing grouped rows and layered profile cards use the shared surface. |
| ReferralScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| ReportIssueScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| RequestDetailScreen | Registered | Existing layered request content, explicit action controls and retry states reviewed. |
| RequestQueueScreen | Registered | Existing green approval, red decline and outlined secondary actions reviewed. |
| RespondToDisputeScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| ReturnHelpScreen | Registered | Redesigned item summary, icon action cards, compact refresh, report empty state and disclosure row; preserves report/appeal permissions. |
| SafetyReportsScreen | Registered | Raised report cards; explicit refresh, profile, suspend, restore and pagination buttons. |
| SavedScreen | Registered | Existing layered item cards and browse action reviewed. |
| SubscriptionScreen | Registered | Compatibility wrapper uses the identity-verification screen and its updated purchase controls. |
| SustainabilityScreen | Not directly registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| TransactionDetailScreen | Registered | Red report button, filled primary button, layered item/status cards, secondary action rows, shorter guidance, role label and due-date fix. |
| TransactionHistoryScreen | Registered | Outlined retry action; shared layered cards. |
| UserProfileScreen | Registered | Shared surfaces and profile safety controls use the same theme. |
| WantedPostsScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| auth/FindAccountScreen | Registered | Reviewed form hierarchy, filled main action, recovery links and disabled states. |
| auth/ForgotPasswordScreen | Registered | Reviewed form hierarchy, filled main action, recovery links and disabled states. |
| auth/LoginScreen | Registered | Reviewed form hierarchy, filled main action, recovery links and disabled states. |
| auth/RegisterScreen | Registered | Reviewed form hierarchy, filled main action, recovery links and disabled states. |
| auth/VerifyIdentityScreen | Registered | Shared verification retry/restore controls now visibly outlined. |
| auth/VerifySignupEmailScreen | Registered | Reviewed form hierarchy, filled main action, recovery links and disabled states. |
| auth/WelcomeScreen | Registered | Reviewed form hierarchy, filled main action, recovery links and disabled states. |
| onboarding/OnboardingCompleteScreen | Registered | Reviewed welcome/progress hierarchy, illustration, main action and secondary navigation. |
| onboarding/OnboardingFriendsScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| onboarding/OnboardingIntroScreen | Registered | Reviewed welcome/progress hierarchy, illustration, main action and secondary navigation. |
| onboarding/OnboardingNeighborhoodScreen | Not directly registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| onboarding/OnboardingPlanScreen | Registered | Migrated duplicate flat panel styling to the common cream surface, fine border and subtle depth. |
| onboarding/OnboardingTownScreen | Registered | Reviewed welcome/progress hierarchy, illustration, main action and secondary navigation. |
| onboarding/OnboardingVerifyScreen | Registered | Shared verification retry/restore controls now visibly outlined. |
| onboarding/OnboardingWelcomeScreen | Not directly registered | Reviewed welcome/progress hierarchy, illustration, main action and secondary navigation. |

## Shared component review

The shared review covered palette/typography references, card styles, icon usage, action boundaries, disabled/loading states, and text wrapping. Detailed review included ActionButton, LayeredCard, GroupedList, PendingRequestCard, RentalProgress, ChatExchangeCard, UserSafetyActions, VerificationPurchaseActions, ActionSheet, ThemedAlert and HapticPressable.

The new ActionRow supplies the icon tile, label/description, chevron and accessible button semantics used by the return screens. ActionButton's default remains the outlined secondary style; filled green or red actions are explicit. Text labels can wrap, and loading/disabled actions stay blocked. The native bottom navigation and existing icon drawings retain their established design.
