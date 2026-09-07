# Borrowhood account emails

All current app email flows share `server/src/services/emailTemplates.js`:

- Email/password signup: six-digit code, expires in ten minutes; an account is created only after confirmation.
- Password reset: six-digit code, expires in one hour.
- Connect Apple or Google: six-digit code, expires in ten minutes.
- Find account: instructions for the account's available sign-in methods.

Each message includes responsive HTML, a plain-text alternative, a selectable code when needed, a restrained preheader, and support/Terms/Privacy links. The sender remains `Borrowhood <noreply@borrowhood.net>` and replies go to the existing support contact, `chris@borrowhood.net`. There are no external images, tracking pixels, or promotional content.

Email/password signup starts a pending challenge rather than creating an account or issuing tokens. Apple and Google continue to validate email with their own providers. Existing accounts keep their current sign-in behavior. Email confirmation is separate from the app's identity-verification badge.

The code screen supports autofill/paste, resend, changing the email by returning to the original form, and signing in instead. Resends wait at least 60 seconds and are capped at five sends per email per hour; codes expire after ten minutes and allow five guesses. Pending passwords are bcrypt hashes and codes are HMAC hashes bound to their challenge. Starting a new form rotates the challenge ID. Expired abandoned data is removed after a day during startup/signup cleanup. Verification is transactional and one-use, and never merges into an account created through another flow.

Older builds without the code screen receive an update-required response for new email/password registrations. Apple/Google and existing-account sign-in continue to work. The server must deploy before the mobile build is distributed.

Invitations currently use SMS/share, not email. Welcome and exchange-update emails are not sent by this change.

`email.js` handles every current send. A missing provider or a rejected send raises an error without logging addresses, verification codes, message bodies, or raw provider errors. Auth routes retain their existing generic public responses to account lookup/reset requests.

Run the isolated tests with `cd server && npm run test:privacy`. They cover content escaping, code expiry text, supported sign-in methods, plain-text fallback, and mocked delivery success/failure. No real email is sent by these tests.

Before enabling any additional email flow, connect it to the actual product event and use this shared renderer. Verify the code lifetime against the backend. New promotional email requires a separate consent and unsubscribe design.
