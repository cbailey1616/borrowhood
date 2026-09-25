# Social Account Linking

## Problem

When a verified Google or Apple email matches an existing Borrowhood account without a linked provider, the API returns `ACCOUNT_LINK_REQUIRED`. The old Welcome screen mixed provider buttons, email-code verification, password recovery, and signup links. It did not clearly explain why a person who had just chosen Google was being asked to sign in again.

## Changes

- Account linking now has a focused screen with the selected provider and email, a brief existing-account explanation, and one primary action.
- Email code is the default. Password entry and password recovery appear only after choosing the password option.
- Back returns to the provider choices and discards the pending challenge, code, and password.
- The code screen includes one-time-code autofill/paste, validation for six digits, code expiry information, and a 60-second resend countdown matching the server.
- Busy actions cannot be submitted twice or switched mid-request.
- Delivery errors do not claim a code was sent. A failed resend stops offering the invalidated earlier challenge; a rate-limit rejection retains the earlier challenge.
- Normal Google/Apple sign-in, account creation, email sign-in, and existing session acceptance are unchanged. Account linking still requires the existing password or email code; there is no automatic linking based only on an email match.
- No provider tokens are added to navigation parameters or persisted by the new component.

## Validation

- 67 tests passed across SocialAccountLink, WelcomeScreen, LoginScreen, ForgotPasswordScreen, SocialSignInButtons, and AuthContext.
- Tests cover both provider choices, password recovery, wrong codes, duplicate submission, cooldown, failed delivery, replaced challenges, stale responses, and switching providers without retaining the prior proof.
- iOS/Hermes production export passed with 1,649 modules. The missing Android `google-services.json` warning did not block the iOS export.
- AuthContext tests emitted an existing React `act(...)` warning; the suite passed.
- Actual screen components were rendered through React Native Web with synthetic account and API responses. Screens were checked at widths 320, 393, and 768px. Checked actions meet a 44px minimum and have no horizontal overflow or offscreen bounds.
- Native Google/Apple SDK interaction, iOS keyboard/autofill, and VoiceOver still require device checks. No real sign-in, email delivery, account change, push, or TestFlight submission occurred during this local review.
- Earlier Return Help changes remain in the worktree.

## Previews

- [Connect Google](social-link-2026-09-25/google-connect.png)
- [Enter the email code](social-link-2026-09-25/email-code.png)
- [Password option](social-link-2026-09-25/password-option.png)
- [Delivery error](social-link-2026-09-25/delivery-error.png)
- [Connect Apple](social-link-2026-09-25/apple-connect.png)
- [Narrow screen with a long email](social-link-2026-09-25/google-connect-narrow.png)
- [Code entry on a narrow screen](social-link-2026-09-25/email-code-narrow.png)
- [Tablet](social-link-2026-09-25/google-connect-tablet.png)
