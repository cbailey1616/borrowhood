# BorrowHood Complete App Audit
**Generated: February 8, 2026 | Build #80 | v1.0.0**

---

## Table of Contents
1. [Screens & Pages](#1-screens--pages)
2. [API Routes](#2-api-routes)
3. [User Roles](#3-user-roles)
4. [Navigation Paths](#4-navigation-paths)
5. [Permission Gates](#5-permission-gates)
6. [Stripe Integrations](#6-stripe-integrations)
7. [Notification Triggers](#7-notification-triggers)
8. [Database Tables](#8-database-tables)
9. [Third-Party Integrations](#9-third-party-integrations)
10. [User-Facing Settings](#10-user-facing-settings)

---

## 1. Screens & Pages

### Authentication (AuthNavigator)
| # | Screen | File | Purpose |
|---|--------|------|---------|
| 1 | WelcomeScreen | `auth/WelcomeScreen.js` | Entry screen with login/register buttons |
| 2 | LoginScreen | `auth/LoginScreen.js` | Email/password login with social auth |
| 3 | RegisterScreen | `auth/RegisterScreen.js` | Signup with email, name, password |
| 4 | ForgotPasswordScreen | `auth/ForgotPasswordScreen.js` | Password reset via email code |
| 5 | VerifyIdentityScreen | `auth/VerifyIdentityScreen.js` | Identity verification during auth flow |

### Onboarding (OnboardingNavigator)
| # | Screen | File | Purpose |
|---|--------|------|---------|
| 6 | OnboardingWelcomeScreen | `onboarding/OnboardingWelcomeScreen.js` | Step 1: Welcome message |
| 7 | OnboardingNeighborhoodScreen | `onboarding/OnboardingNeighborhoodScreen.js` | Step 2: Choose neighborhood |
| 8 | OnboardingFriendsScreen | `onboarding/OnboardingFriendsScreen.js` | Step 3: Invite friends from contacts |
| 9 | OnboardingPlanScreen | `onboarding/OnboardingPlanScreen.js` | Step 4: Choose subscription tier |
| 10 | OnboardingCompleteScreen | `onboarding/OnboardingCompleteScreen.js` | Step 5: Completion celebration |

### Main Tabs (MainNavigator - Bottom Tab Bar)
| # | Tab | Screen | File | Purpose |
|---|-----|--------|------|---------|
| 11 | Feed | FeedScreen | `FeedScreen.js` | Browse items & wanted posts in neighborhood |
| 12 | Saved | SavedScreen | `SavedScreen.js` | Saved/liked items |
| 13 | My Items | MyItemsScreen | `MyItemsScreen.js` | User's listings & requests (dual tab) |
| 14 | Inbox | InboxScreen | `InboxScreen.js` | Conversations & transaction activities |
| 15 | Profile | ProfileScreen | `ProfileScreen.js` | User profile, settings, badges |

### Detail Screens (Push Navigation)
| # | Screen | File | Purpose |
|---|--------|------|---------|
| 16 | ListingDetailScreen | `ListingDetailScreen.js` | Full item detail with borrow button |
| 17 | ListingDiscussionScreen | `ListingDiscussionScreen.js` | Q&A/comments on listing |
| 18 | RequestDetailScreen | `RequestDetailScreen.js` | Wanted post detail |
| 19 | TransactionDetailScreen | `TransactionDetailScreen.js` | Transaction status, receipt, actions |
| 20 | UserProfileScreen | `UserProfileScreen.js` | View other user's profile |
| 21 | ChatScreen | `ChatScreen.js` | 1:1 messaging conversation |
| 22 | ConversationsScreen | `ConversationsScreen.js` | All message threads |
| 23 | DisputeDetailScreen | `DisputeDetailScreen.js` | Dispute resolution detail |
| 24 | DisputesScreen | `DisputesScreen.js` | Disputes history list |
| 25 | FriendsScreen | `FriendsScreen.js` | Friends list & requests |
| 26 | BrowseScreen | `BrowseScreen.js` | Items + wanted posts with distance filters |
| 27 | WantedPostsScreen | `WantedPostsScreen.js` | Wanted posts with filter |
| 28 | ActivityScreen | `ActivityScreen.js` | Transaction activity timeline |

### Modal Screens
| # | Screen | File | Presentation | Purpose |
|---|--------|------|-------------|---------|
| 29 | CreateListingScreen | `CreateListingScreen.js` | modal | Create item listing |
| 30 | EditListingScreen | `EditListingScreen.js` | modal | Edit listing |
| 31 | CreateRequestScreen | `CreateRequestScreen.js` | modal | Create wanted post |
| 32 | EditRequestScreen | `EditRequestScreen.js` | modal | Edit wanted post |
| 33 | BorrowRequestScreen | `BorrowRequestScreen.js` | modal | Request to borrow item |
| 34 | EditProfileScreen | `EditProfileScreen.js` | modal | Edit user profile |
| 35 | AddPaymentMethodScreen | `AddPaymentMethodScreen.js` | modal | Add credit card |
| 36 | IdentityVerificationScreen | `IdentityVerificationScreen.js` | modal | Government ID verification |
| 37 | PaymentFlowScreen | `PaymentFlowScreen.js` | modal | Stripe PaymentSheet |
| 38 | RentalCheckoutScreen | `RentalCheckoutScreen.js` | modal | Confirm rental transaction |
| 39 | DamageClaimScreen | `DamageClaimScreen.js` | modal | File damage claim |

### FormSheet Screens
| # | Screen | File | Presentation | Purpose |
|---|--------|------|-------------|---------|
| 40 | NotificationSettingsScreen | `NotificationSettingsScreen.js` | formSheet | Notification toggles |
| 41 | SetupPayoutScreen | `SetupPayoutScreen.js` | formSheet | Stripe Connect onboarding |

### Membership & Community Screens
| # | Screen | File | Purpose |
|---|--------|------|---------|
| 42 | SubscriptionScreen | `SubscriptionScreen.js` | BorrowHood Plus plans |
| 43 | PaymentMethodsScreen | `PaymentMethodsScreen.js` | Manage saved cards & payout status |
| 44 | ReferralScreen | `ReferralScreen.js` | Referral program with share link |
| 45 | BadgesScreen | `BadgesScreen.js` | Achievement badges |
| 46 | MyCommunityScreen | `MyCommunityScreen.js` | Community info & members |
| 47 | JoinCommunityScreen | `JoinCommunityScreen.js` | Search & join neighborhood |
| 48 | CommunitySettingsScreen | `CommunitySettingsScreen.js` | Community admin settings |
| 49 | InviteMembersScreen | `InviteMembersScreen.js` | Invite users to community |
| 50 | CommunityLibraryScreen | `CommunityLibraryScreen.js` | Shared library items |

### Additional Screens
| # | Screen | File | Purpose |
|---|--------|------|---------|
| 51 | LendingCirclesScreen | `LendingCirclesScreen.js` | Lending circles/groups |
| 52 | BundlesScreen | `BundlesScreen.js` | Item bundles/collections |
| 53 | SustainabilityScreen | `SustainabilityScreen.js` | Sustainability impact stats |
| 54 | NotificationsScreen | `NotificationsScreen.js` | Notification center |

**Total: 54 screens**

---

## 2. API Routes

### Auth (`/api/auth`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/register` | None | User registration |
| POST | `/login` | None | Email/password login |
| POST | `/google` | None | Google OAuth sign-in |
| POST | `/apple` | None | Apple OAuth sign-in |
| POST | `/verify-identity` | JWT | Start Stripe Identity verification |
| POST | `/reset-verification` | JWT | Reset verification to retry |
| POST | `/check-verification` | JWT | Check verification status |
| GET | `/me` | JWT | Get current user profile |
| POST | `/forgot-password` | None | Request password reset code |
| POST | `/reset-password` | None | Reset password with code |
| POST | `/admin/reset-onboarding` | ADMIN_SECRET | Reset onboarding progress |
| POST | `/admin/reset-verifications` | ADMIN_SECRET | Reset all verifications |
| POST | `/admin/reset-user` | ADMIN_SECRET | Full user data reset |

### Users (`/api/users`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/:id` | JWT | Get public user profile |
| GET | `/:id/listings` | JWT | Get user's active listings |
| PATCH | `/me` | JWT | Update profile (locks verified fields) |
| GET | `/me/friends` | JWT | Get accepted friends |
| GET | `/me/friend-requests` | JWT | Get pending friend requests |
| POST | `/me/friend-requests/:id/accept` | JWT | Accept friend request |
| POST | `/me/friend-requests/:id/decline` | JWT | Decline friend request |
| GET | `/suggested` | JWT | Suggested users from community |
| GET | `/search` | JWT | Search users by name/email |
| POST | `/contacts/match` | JWT | Find users by phone numbers |
| POST | `/me/friends` | JWT | Send friend request |
| DELETE | `/me/friends/:id` | JWT | Remove friend |
| GET | `/:id/ratings` | JWT | Get user's ratings |
| GET | `/me/connect-status` | JWT | Stripe Connect account status |
| POST | `/me/connect-account` | JWT + Verified | Create Stripe Connect account |
| POST | `/me/connect-onboarding` | JWT + Verified | Get Connect onboarding link |
| GET | `/me/connect-balance` | JWT | Get Connect account balance |

### Communities (`/api/communities`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | JWT | List communities (user's or nearby) |
| GET | `/nearby` | JWT | Find communities by coordinates |
| GET | `/:id` | JWT | Get community details |
| POST | `/:id/join` | JWT | Join a community |
| POST | `/:id/leave` | JWT | Leave community |
| GET | `/:id/members` | JWT | Get community members |
| POST | `/` | JWT | Create new neighborhood |
| POST | `/:id/add-admin` | JWT + Organizer | Add user as organizer |

### Listings (`/api/listings`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | JWT | Browse available listings (visibility-filtered) |
| GET | `/mine` | JWT | Get current user's listings |
| GET | `/:id` | JWT | Get listing details |
| POST | `/analyze-image` | JWT | AI image analysis for item details |
| POST | `/` | JWT | Create new listing |
| PATCH | `/:id` | JWT + Owner | Update listing |
| DELETE | `/:id` | JWT + Owner | Soft delete listing |

### Requests (`/api/requests`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | JWT | Browse open requests in communities |
| GET | `/mine` | JWT | Get user's requests |
| GET | `/:id` | JWT | Get request details |
| POST | `/` | JWT | Create item/service request |
| POST | `/:id/renew` | JWT + Owner | Renew expired request |
| PATCH | `/:id` | JWT + Owner | Update request |
| DELETE | `/:id` | JWT + Owner | Close request |

### Transactions (`/api/transactions`) - Legacy
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/` | JWT | Request to borrow item |
| GET | `/` | JWT | Get user's transactions |
| GET | `/:id` | JWT + Party | Get transaction details |
| POST | `/:id/approve` | JWT + Lender | Approve borrow request |
| POST | `/:id/decline` | JWT + Lender | Decline request |
| POST | `/:id/confirm-payment` | JWT + Borrower | Confirm payment |
| POST | `/:id/pickup` | JWT + Lender | Confirm pickup |
| POST | `/:id/return` | JWT + Lender | Confirm return |
| POST | `/:id/rate` | JWT + Party | Rate the other party |

### Rentals (`/api/rentals`) - New
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/request` | JWT | Request rental |
| POST | `/:id/approve` | JWT + Lender | Approve & create payment auth |
| POST | `/:id/decline` | JWT + Lender | Decline rental |
| POST | `/:id/confirm-payment` | JWT + Borrower | Confirm payment authorization |
| POST | `/:id/pickup` | JWT + Lender | Confirm pickup (partial capture) |
| POST | `/:id/return` | JWT + Lender | Confirm return & trigger payout |
| POST | `/:id/damage-claim` | JWT + Lender | File damage claim |
| POST | `/:id/late-fee` | JWT + Lender | Create late fee payment intent |
| GET | `/:id/payment-status` | JWT + Party | Get payment/overdue status |

### Disputes (`/api/disputes`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | JWT | Get disputes (organizers see community) |
| GET | `/:id` | JWT + Party/Organizer | Get dispute details |
| POST | `/:id/resolve` | JWT + Organizer | Resolve dispute |
| POST | `/:id/evidence` | JWT + Party | Add evidence |

### Messages (`/api/messages`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/conversations` | JWT | List conversations |
| GET | `/conversations/:id` | JWT + Participant | Get messages in conversation |
| POST | `/` | JWT | Send message |
| POST | `/conversations/:id/read` | JWT + Participant | Mark as read |

### Notifications (`/api/notifications`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | JWT | Get notifications |
| GET | `/badge-count` | JWT | Unread counts (messages/notifications/actions) |
| POST | `/:id/read` | JWT + Owner | Mark notification read |
| POST | `/read-all` | JWT | Mark all read |
| PUT | `/push-token` | JWT | Update push notification token |
| PATCH | `/preferences` | JWT | Update notification preferences |

### Subscriptions (`/api/subscriptions`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/tiers` | JWT | Available tiers (Free, Plus) |
| GET | `/current` | JWT | Current subscription status |
| POST | `/subscribe` | JWT | Create Plus subscription |
| POST | `/cancel` | JWT | Cancel at period end |
| POST | `/reactivate` | JWT | Reactivate cancelled subscription |
| POST | `/retry-payment` | JWT | Retry failed payment |
| GET | `/access-check` | JWT | Feature access check |
| GET | `/can-charge` | JWT | Can charge for rentals check |

### Payments (`/api/payments`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/create-payment-intent` | JWT | One-time payment intent |
| POST | `/refund` | JWT | Full or partial refund |

### Payment Methods (`/api/payment-methods`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | JWT | List saved cards |
| POST | `/` | JWT | Save new card (SetupIntent) |
| POST | `/:id/default` | JWT | Set default payment method |
| DELETE | `/:id` | JWT | Remove saved card |

### Identity (`/api/identity`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/verify` | JWT | Create verification session |
| GET | `/status` | JWT | Poll verification status |

### Other Routes
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/categories` | JWT | All active categories |
| PATCH | `/api/onboarding/step` | JWT | Update onboarding step |
| POST | `/api/onboarding/complete` | JWT | Mark onboarding complete |
| POST | `/webhooks/stripe` | Stripe Signature | Webhook handler |
| GET | `/api/feed` | JWT | Feed route |
| GET | `/api/sustainability` | JWT | Sustainability stats |
| GET | `/api/badges` | JWT | Badge definitions |
| * | `/api/bundles` | JWT | Bundle operations |
| * | `/api/circles` | JWT | Lending circle operations |
| * | `/api/seasonal` | JWT | Seasonal content |
| * | `/api/listings` (availability) | JWT | Availability calendar |
| * | `/api/library` | JWT | Community library |
| * | `/api/saved` | JWT | Saved items |
| * | `/api/listings` (discussions) | JWT | Listing Q&A |
| * | `/api/referrals` | JWT | Referral program |
| * | `/api/uploads` | JWT | File uploads |

### Static Pages
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/terms` | Terms of service HTML |
| GET | `/privacy` | Privacy policy HTML |
| GET | `/verification-complete` | Stripe verification return page |
| GET | `/connect/return` | Stripe Connect return page |
| GET | `/health` | Health check |

**Total: 90+ API endpoints**

---

## 3. User Roles

### Account Tiers
| Role | Description | Capabilities |
|------|-------------|-------------|
| **Free User** | Default tier | Browse close_friends & neighborhood items, borrow free items, create free listings, message, rate |
| **Plus Subscriber** | $1/mo or $10/yr | All free features + town-level browsing, charge rental fees, borrow paid items, create town-visible listings |
| **Founder** | `is_founder` flag | Special badge, early adopter recognition |

### Verification Levels
| Level | Description | Unlocks |
|-------|-------------|---------|
| **Unverified** | Default state | Basic browsing & free borrowing |
| **Verified** | Stripe Identity (ID + selfie) | Town listings, paid rentals, Stripe Connect setup |
| **Grace Period** | 6-hour window after verification starts | Temporary access while Stripe processes |

### Community Roles
| Role | Scope | Capabilities |
|------|-------|-------------|
| **Member** | Per community | Browse, post, borrow within community |
| **Organizer** | Per community | Resolve disputes, add admins, manage community settings |

### Transaction Roles
| Role | Per Transaction | Capabilities |
|------|----------------|-------------|
| **Lender** | Item owner | Approve/decline, confirm pickup/return, file damage claim, create late fee |
| **Borrower** | Item requester | Request, pay, rate |

### System Roles
| Role | Access | Capabilities |
|------|--------|-------------|
| **Admin** | ADMIN_SECRET env var | Reset onboarding, reset verifications, reset user data |

---

## 4. Navigation Paths

### Root Flow
```
App Start
  |-- Not Authenticated --> AuthNavigator
  |     |-- WelcomeScreen --> Login | Register
  |     |-- LoginScreen --> ForgotPassword | Register | Main
  |     |-- RegisterScreen --> VerifyIdentity | Main
  |     |-- ForgotPasswordScreen --> Login
  |
  |-- Authenticated + !Onboarded --> OnboardingNavigator
  |     |-- Step 1: Welcome --> Step 2
  |     |-- Step 2: Neighborhood --> Step 3
  |     |-- Step 3: Friends --> Step 4
  |     |-- Step 4: Plan --> Step 5 (or Verification/Subscription modals)
  |     |-- Step 5: Complete --> Main
  |
  |-- Authenticated + Onboarded --> MainNavigator (5 tabs)
```

### Tab Navigation
```
Feed -----> Saved -----> My Items -----> Inbox -----> Profile
  |           |            |               |            |
  v           v            v               v            v
ListingDetail ListingDetail ListingDetail  Chat        EditProfile
BrowseScreen  Feed(empty)  CreateListing   Transaction  Subscription
UserProfile               CreateRequest   Detail       Friends
                          EditListing                  PaymentMethods
                          EditRequest                  MyCommunity
                                                       Referral
                                                       Disputes
                                                       NotificationSettings
```

### Key Screen-to-Screen Paths
```
ListingDetail --> BorrowRequest --> (payment) --> Activity
ListingDetail --> ListingDiscussion
ListingDetail --> UserProfile --> Chat
ListingDetail --> EditListing (if owner)

BorrowRequest --> Subscription (if !Plus for paid items)
BorrowRequest --> IdentityVerification (if !verified for paid/town items)

CreateListing --> Subscription (if charging and !Plus)
CreateListing --> JoinCommunity (if no community)

TransactionDetail --> RentalCheckout
TransactionDetail --> DamageClaim
TransactionDetail --> DisputeDetail

Profile --> SetupPayout (via PaymentMethods)
Profile --> IdentityVerification (via Subscription gate)

Push Notification --> TransactionDetail | Chat | ListingDetail | RequestDetail | DisputeDetail | Profile
```

### Premium Gate Flow (3-step progressive)
```
Feature Attempt (town browse / paid rental / create paid listing)
  |
  Step 1: Plus Subscription Required?
  |     --> SubscriptionScreen --> subscribe --> Step 2
  |
  Step 2: Identity Verification Required?
  |     --> IdentityVerificationScreen --> verify --> Step 3
  |
  Step 3: Payout Setup Required? (lenders only)
        --> SetupPayoutScreen --> connect --> Feature Unlocked
```

---

## 5. Permission Gates

### Server-Side Middleware
| Middleware | File | Check | Response |
|-----------|------|-------|----------|
| `authenticate` | `auth.js` | Valid JWT, user exists, not suspended | 401/403 |
| `requireVerified` | `auth.js` | `user.status === 'verified'` | 403 |
| `requireSubscription` | `auth.js` | `subscription_tier === 'plus'` | 403 |
| `requireOrganizer` | `auth.js` | Community membership `role === 'organizer'` | 403 |

### Server-Side Inline Gates
| Gate | Route | Check | Error Code |
|------|-------|-------|------------|
| Paid rental borrowing | `POST /api/transactions` | `tier !== 'plus'` for paid items | `PLUS_REQUIRED` |
| Paid rental verification | `POST /api/transactions` | `!is_verified` for paid/town items | `VERIFICATION_REQUIRED` |
| Town listing city match | `POST /api/transactions` | Borrower city must match listing city | `CITY_MISMATCH` |
| Verified field lock | `PATCH /api/users/me` | Cannot change name/address if verified | 403 |
| Connect account creation | `POST /me/connect-account` | `requireVerified` middleware | 403 |
| Connect onboarding | `POST /me/connect-onboarding` | `requireVerified` middleware | 403 |
| Listing ownership | `PATCH/DELETE /api/listings/:id` | Must be listing owner | 403 |
| Transaction party check | All transaction actions | Must be lender or borrower | 403 |
| Dispute resolution | `POST /api/disputes/:id/resolve` | Must be community organizer | 403 |

### Client-Side Gates (`premiumGate.js`)
| Source | Step 1 | Step 2 | Step 3 |
|--------|--------|--------|--------|
| `rental_listing` (creating paid listing) | Plus subscription | Identity verified | Connect account |
| `town_browse` (viewing town items) | Plus subscription | Identity verified | - |
| Borrowing paid items (`BorrowRequestScreen`) | Plus subscription | Identity verified | - |

### Listing Visibility Gates
| Visibility | Who Can See | Requirements |
|------------|-------------|-------------|
| `close_friends` | Friends only | Must be friends with owner |
| `neighborhood` | Community members | Must be in same community |
| `town` | Same city | Plus + Verified + Same city |

---

## 6. Stripe Integrations

### Products Used
| Product | Purpose | Mobile SDK |
|---------|---------|-----------|
| **Stripe Identity** | Government ID + selfie verification | `@stripe/stripe-identity-react-native` |
| **Stripe Payments** | Rental payments, deposits, late fees | `@stripe/stripe-react-native` (PaymentSheet) |
| **Stripe Connect Express** | Lender payouts | In-app browser (`expo-web-browser`) |
| **Stripe Subscriptions** | BorrowHood Plus ($1/mo, $10/yr) | PaymentSheet |
| **Stripe Webhooks** | Event processing | Server-side |

### Payment Flow
```
Borrower requests rental
  --> Lender approves --> PaymentIntent created (manual capture, auth hold)
    --> Borrower confirms payment (PaymentSheet)
      --> Lender confirms pickup --> Partial capture (rental fee only)
        --> Lender confirms return
          --> Deposit refunded (if no damage)
          --> Transfer to lender Connect account (rental fee - 2% platform fee)
```

### Stripe API Calls (server/src/services/stripe.js)
| Function | Stripe API | Purpose |
|----------|-----------|---------|
| `createStripeCustomer` | `customers.create` | New customer with metadata |
| `createConnectAccount` | `accounts.create` | Express Connect with pre-filled individual data |
| `createConnectAccountLink` | `accountLinks.create` | Onboarding URL |
| `getConnectAccount` | `accounts.retrieve` | Account status |
| `createPaymentIntent` | `paymentIntents.create` | Auth hold for rental + deposit |
| `getPaymentIntent` | `paymentIntents.retrieve` | Payment status |
| `capturePaymentIntent` | `paymentIntents.capture` | Capture at pickup |
| `cancelPaymentIntent` | `paymentIntents.cancel` | Cancel pending payment |
| `createTransfer` | `transfers.create` | Pay lender via Connect |
| `createEphemeralKey` | `ephemeralKeys.create` | PaymentSheet auth (1hr expiry) |
| `constructWebhookEvent` | `webhooks.constructEvent` | Verify webhook signature |
| `refundPayment` | `refunds.create` | Full or partial refund |
| `createSetupIntent` | `setupIntents.create` | Save card for future use |
| `listPaymentMethods` | `paymentMethods.list` | List saved cards |
| `detachPaymentMethod` | `paymentMethods.detach` | Remove saved card |

### Webhook Events Handled
| Event | Handler Action |
|-------|---------------|
| `identity.verification_session.verified` | Mark user verified, store name/DOB/address |
| `identity.verification_session.requires_input` | Mark as requiring re-submission |
| `payment_intent.succeeded` | Update transaction to payment_confirmed |
| `payment_intent.payment_failed` | Set payment_status to failed |
| `payment_intent.canceled` | Cancel transaction, mark listing available |
| `payment_intent.amount_capturable_updated` | Record authorization hold success |
| `account.updated` | Check Connect charges+payouts enabled |
| `invoice.paid` | Activate Plus subscription |
| `invoice.payment_failed` | Notify user to update payment method |
| `customer.subscription.updated` | Handle past_due, cancel_at_period_end |
| `customer.subscription.deleted` | Reset to free tier |
| `charge.refunded` | Log refund to audit_log |
| `charge.dispute.created` | Create dispute record |

### Fee Structure
| Fee | Amount | When |
|-----|--------|------|
| Platform fee | 2% of rental_fee | Deducted from lender payout at return |
| Late fee | `late_fee_per_day` x overdue days | Charged to borrower |
| Damage claim | Up to deposit amount | Captured from held deposit |
| Organizer fee | 2% of disputed amount | Deducted during dispute resolution |

---

## 7. Notification Triggers

### Notification Types (20 defined)
| Type | Title | Triggered By |
|------|-------|-------------|
| `borrow_request` | New Borrow Request | Borrower requests item |
| `request_approved` | Request Approved | Lender approves |
| `request_declined` | Request Declined | Lender declines |
| `payment_confirmed` | Payment Received | Payment succeeds (webhook) |
| `pickup_confirmed` | Item Picked Up | Lender confirms pickup |
| `return_confirmed` | Item Returned | Lender confirms return |
| `return_reminder` | Return Reminder | Approaching due date |
| `dispute_opened` | Dispute Opened | Damage claim or chargeback |
| `dispute_resolved` | Dispute Resolved | Organizer resolves |
| `rating_received` | New Rating | Other party rates |
| `new_rating` | New Rating | (alias) |
| `join_request` | Join Request | Community join |
| `join_approved` | Welcome! | Identity verified (webhook) |
| `item_match` | Item Match | New listing matches request |
| `new_request` | New Request | New wanted post |
| `new_message` | New Message | Message sent |
| `discussion_reply` | Reply to Your Question | Reply to listing Q&A |
| `listing_comment` | New Question on Your Listing | New Q&A on owned listing |
| `referral_joined` | Friend Joined! | Referral code used |
| `referral_reward` | Free Plus Unlocked! | 3 successful referrals |

### Delivery Channels
| Channel | Implementation |
|---------|---------------|
| In-app | Stored in `notifications` table, displayed in InboxScreen |
| Push | Expo Push Service (`exp.host/--/api/v2/push/send`) |
| Deep link | Push notification tap navigates to relevant screen |

### Notification Preferences (user-configurable)
Stored as JSONB in `users.notification_preferences`:
- `borrow_request`, `request_response`, `return_reminder`
- `payment_updates`, `pickup_return`, `rating_received`
- `new_message`, `item_match`, `new_request`, `community_updates`
- `push_enabled`, `push_sound`

---

## 8. Database Tables

### Core Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **users** | User accounts | id, email, phone, password_hash, first_name, last_name, profile_photo_url, bio, city, state, zip_code, location (PostGIS), status, is_verified, subscription_tier, stripe_customer_id, stripe_connect_account_id, date_of_birth, onboarding_step, onboarding_completed, is_founder |
| **communities** | Neighborhoods | id, name, slug, city, state, boundary (PostGIS polygon), center (PostGIS point), radius_miles, community_type, is_active |
| **community_memberships** | User-community links | id, user_id, community_id, role (member/organizer), joined_at |
| **friendships** | Friend connections | id, user_id, friend_id, status (pending/accepted) |

### Content Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **categories** | Item categories | id, name, slug, icon, parent_id, sort_order |
| **listings** | Items for lending | id, owner_id, community_id, category_id, title, description, condition, is_free, price_per_day, deposit_amount, min/max_duration, visibility, status, late_fee_per_day |
| **listing_photos** | Item images | id, listing_id, url, sort_order |
| **item_requests** | Wanted posts | id, user_id, community_id, title, description, needed_from/until, visibility, status, expires_at, type (item/service) |

### Transaction Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **borrow_transactions** | Rental transactions | id, listing_id, borrower_id, lender_id, dates, rental_fee, deposit_amount, platform_fee, lender_payout, status, payment_status, stripe_payment_intent_id, condition_at_pickup/return, late_fee_amount_cents, damage_claim_amount_cents |
| **disputes** | Transaction disputes | id, transaction_id, opened_by_id, reason, evidence_urls, status, resolved_by_id, resolution_notes, deposit_to_lender/borrower, organizer_fee |
| **ratings** | User ratings | id, transaction_id, rater_id, ratee_id, rating (1-5), comment, is_lender_rating |

### Communication Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **conversations** | Message threads | id, user1_id, user2_id, listing_id |
| **messages** | Individual messages | id, conversation_id, sender_id, content, is_read |
| **notifications** | In-app notifications | id, user_id, type, title, body, transaction_id, listing_id, from_user_id, request_id, is_read, push_sent |

### System Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **audit_log** | Action audit trail | id, actor_id, action, entity_type, entity_id, old_values, new_values, ip_address |
| **subscription_history** | Subscription changes | user_id, tier, action, amount_cents, stripe_payment_id |

### Enums
| Enum | Values |
|------|--------|
| `user_status` | pending, verified, suspended |
| `membership_role` | member, organizer |
| `visibility_level` | close_friends, neighborhood, town |
| `item_condition` | like_new, good, fair, worn |
| `listing_status` | active, paused, deleted |
| `request_status` | open, fulfilled, closed |
| `borrow_status` | pending, approved, paid, picked_up, return_pending, returned, disputed, cancelled, completed |
| `dispute_status` | open, resolved_lender, resolved_borrower, resolved_split |
| `notification_type` | borrow_request, request_approved, request_declined, pickup_confirmed, return_reminder, item_overdue, return_confirmed, dispute_opened, dispute_resolved, rating_received, new_listing_match |
| `payment_status` | none, pending, authorized, captured, failed, cancelled, completed, damage_claimed, disputed |

**Total: 15 tables + 10 enums**

---

## 9. Third-Party Integrations

### Mobile Dependencies
| Integration | Package | Purpose |
|-------------|---------|---------|
| **Stripe Identity** | `@stripe/stripe-identity-react-native ^0.4.1` | Government ID verification |
| **Stripe Payments** | `@stripe/stripe-react-native ^0.57.3` | PaymentSheet, card management |
| **Google Sign-In** | `@react-native-google-signin/google-signin ^16.1.1` | Google OAuth |
| **Apple Auth** | `expo-apple-authentication ~8.0.8` | Apple Sign-In |
| **Expo Camera** | `expo-camera ~17.0.10` | Photo capture |
| **Expo Contacts** | `expo-contacts ~15.0.11` | Import contacts for friend matching |
| **Expo Haptics** | `expo-haptics ~15.0.8` | Haptic feedback |
| **Expo Image Picker** | `expo-image-picker ~17.0.10` | Photo selection |
| **Expo Location** | `expo-location ~19.0.8` | GPS location |
| **Expo Notifications** | `expo-notifications ~0.32.16` | Push notifications |
| **Expo Web Browser** | `expo-web-browser ~15.0.10` | In-app browser for Connect onboarding |
| **Expo Local Auth** | `expo-local-authentication ~17.0.8` | Face ID / Touch ID |
| **Expo Secure Store** | `expo-secure-store` | Secure credential storage |
| **Expo Blur** | `expo-blur ~15.0.8` | Blur effects |
| **Expo Linear Gradient** | `expo-linear-gradient ~15.0.8` | Gradient backgrounds |
| **Expo Crypto** | `expo-crypto ~15.0.8` | Cryptographic utilities |
| **Reanimated** | `react-native-reanimated ~4.1.1` | Smooth animations |
| **Gesture Handler** | `react-native-gesture-handler` | Swipe actions |

### Server Dependencies
| Integration | Package | Purpose |
|-------------|---------|---------|
| **Stripe** | `stripe ^14.14.0` | Payments, Identity, Connect, Subscriptions |
| **Anthropic Claude** | `@anthropic-ai/sdk ^0.72.1` | AI image analysis for item descriptions |
| **AWS S3** | `@aws-sdk/client-s3 ^3.540.0` | Image/file uploads |
| **PostgreSQL** | `pg ^8.12.0` | Primary database |
| **PostGIS** | (pg extension) | Geospatial queries (location, boundaries) |
| **Google Auth** | `google-auth-library ^10.5.0` | Google OAuth token verification |
| **JWKS RSA** | `jwks-rsa ^3.2.2` | Apple OAuth key validation |
| **bcrypt** | `bcrypt ^5.1.1` | Password hashing |
| **JWT** | `jsonwebtoken ^9.0.2` | Authentication tokens (7d access, 30d refresh) |
| **Helmet** | `helmet ^7.1.0` | Security headers |
| **CORS** | `cors ^2.8.5` | Cross-origin resource sharing |
| **Express Validator** | `express-validator ^7.0.1` | Input validation |
| **Express Rate Limit** | `express-rate-limit` | Rate limiting |

### External Services
| Service | Purpose | Configuration |
|---------|---------|--------------|
| **Stripe** | Payments, identity, payouts | `sk_test_51Svf5n...` (test mode) |
| **Expo Push Service** | Push notifications | `exp.host/--/api/v2/push/send` |
| **Apple App Store Connect** | App distribution | ASC App ID: 6758581435 |
| **EAS Build** | CI/CD builds | Project ID: 7ac93977-f96c-4e47-a9c5-c1802b9ae3d5 |
| **Railway** | Database hosting | PostgreSQL with PostGIS |
| **AWS S3** | File storage | Via `@aws-sdk/client-s3` |

### Rate Limiting Configuration
| Scope | Window | Max Requests |
|-------|--------|-------------|
| General (all routes) | 15 min | 500 |
| Auth routes (`/api/auth`) | 15 min | 100 |
| Stripe routes (`/api/payments`, `/api/subscriptions`, `/api/identity`, `/api/rentals`) | 15 min | 30 |

---

## 10. User-Facing Settings

### Profile Settings (ProfileScreen)
| Setting | Location | Description |
|---------|----------|-------------|
| Profile photo | ProfileScreen | Upload/change avatar |
| First/last name | EditProfileScreen | Locked when verified |
| Bio | EditProfileScreen | Free text |
| City/State | EditProfileScreen | Locked when verified |
| Biometric login | ProfileScreen | Enable/disable Face ID/Touch ID |

### Notification Settings (NotificationSettingsScreen)
| Category | Toggle | Default |
|----------|--------|---------|
| **Borrowing** | Borrow Requests | On |
| | Request Responses | On |
| | Return Reminders | On |
| **Transactions** | Payment Updates | On |
| | Pickup & Return | On |
| | Ratings | On |
| **Community** | Messages | On |
| | Item Matches | On |
| | Request Posts | On |
| | Community Updates | On |
| **Push** | Enable Push Notifications | On |
| | Notification Sound | On |

### Payment Settings (PaymentMethodsScreen)
| Setting | Description |
|---------|-------------|
| Saved cards | Add/remove credit cards |
| Default card | Set default payment method |
| Payout account | Stripe Connect bank account setup |

### Subscription Settings (SubscriptionScreen)
| Setting | Description |
|---------|-------------|
| Current plan | Free or Plus ($1/mo or $10/yr) |
| Cancel subscription | Cancel at period end |
| Reactivate | Reactivate cancelled subscription |
| Retry payment | Retry failed subscription payment |

### Community Settings (CommunitySettingsScreen - Organizer only)
| Setting | Description |
|---------|-------------|
| Community name | Edit neighborhood name |
| Description | Edit community description |
| Invite members | Send invitations |
| Add organizer | Promote member to organizer |

### Identity & Verification
| Setting | Description |
|---------|-------------|
| Identity verification | Verify via Stripe Identity (ID + selfie) |
| Re-verify | Restart verification to change locked fields |

---

## Architecture Summary

```
Mobile (React Native 0.81.5 + Expo 54)
  |-- 54 screens across 4 navigators
  |-- 15 custom iOS 18 components
  |-- 2 context providers (Auth, Error)
  |-- 2 custom hooks (push notifications, biometrics)
  |-- Dark forest green theme with blur/translucency
  |
Server (Express.js + Node.js)
  |-- 90+ API endpoints across 20+ route files
  |-- 4 middleware functions (auth, verified, subscription, organizer)
  |-- 13 webhook event handlers
  |-- 15 database tables with PostGIS
  |-- 3 rate limiter tiers
  |
External Services
  |-- Stripe (Identity, Payments, Connect, Subscriptions)
  |-- Expo Push Service
  |-- AWS S3
  |-- Railway PostgreSQL
  |-- Apple App Store Connect / EAS Build
  |-- Claude AI (image analysis)
```
