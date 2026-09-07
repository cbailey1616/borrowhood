# Borrowhood account emails

All current app email flows share `server/src/services/emailTemplates.js`:

- Password reset: six-digit code, expires in one hour.
- Connect Apple or Google: six-digit code, expires in ten minutes.
- Find account: instructions for the account's available sign-in methods.

Each message includes responsive HTML, a plain-text alternative, a selectable code when needed, a restrained preheader, and support/Terms/Privacy links. The sender remains `Borrowhood <noreply@borrowhood.net>` and replies go to the existing support contact, `chris@borrowhood.net`. There are no external images, tracking pixels, or promotional content.

A matching signup-confirmation template is prepared, but is not called by signup. Email/password signup verification remains a separate feature; this change does not gate or alter account creation, Apple sign-in, or Google sign-in. Invitations currently use SMS/share, not email. Welcome and exchange-update emails are not sent by this change.

`email.js` handles every current send. A missing provider or a rejected send raises an error without logging addresses, verification codes, message bodies, or raw provider errors. Auth routes retain their existing generic public responses to account lookup/reset requests.

Run the isolated tests with `cd server && npm run test:privacy`. They cover content escaping, code expiry text, supported sign-in methods, plain-text fallback, and mocked delivery success/failure. No real email is sent by these tests.

Before enabling any additional email flow, connect it to the actual product event and use this shared renderer. Verify the code lifetime against the backend. New promotional email requires a separate consent and unsubscribe design.
