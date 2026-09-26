# App Review corrections — held for the next update

No production deployment, new TestFlight build, or App Review submission is authorized by this held change. It includes the previously approved Steward rename and handoff from draft PR #60.

## Changes implemented

- First-party text screening before create/edit writes for posts, public replies, neighborhood chat, messages, profile display text, neighborhoods, circles and bundles. Known explicit material, slurs and direct threats are rejected with a clear editable error. Passwords, verification codes and safety report evidence are not screened as public text. This rules-based filter is not an image classifier or a guarantee of exhaustive detection.
- Direct report/block actions on listing and Wanted details (including masked Town previews), public comment menus, neighborhood messages and private messages. Server-side visibility checks resolve authors without revealing a masked identity. Neighborhood reports obey membership removal and the join-date history boundary.
- Bidirectional blocks apply before public reply pagination, counts and thread lookup. A blocked parent cannot be accessed or replied to through a known ID.
- Administrators can view a report's exact text/photos and remove the reported content. Administrative access, reason notes, optimistic concurrency and audit history remain enforced. Removed posts cannot be restored by editing them; active exchange records are preserved. This is the human review path for image reports and content that escapes text filtering.
- Apple authorization codes are exchanged for identity-bound refresh tokens, encrypted at rest using a domain-separated key derived from the server JWT secret. Account deletion atomically moves the token to a durable revocation queue; the job is erased after Apple confirms revocation. Transient failures retry hourly without preventing deletion. Legacy no-token accounts receive Apple's manual disconnect instructions after deletion, as described in TN3194.
- Retained exchange tombstones also lose provider IDs, precise location/address, push registrations, verification badge state and the author's safety-report content snapshots.
- Verification remains free. The app's build-time purchase flag is false, so remote server configuration cannot enable paid verification in this candidate. The future $1.99 non-consumable requires a new reviewed build plus Apple's first-IAP review. Stripe checkout for verification remains disabled.

## Required service setup before releasing

Railway's production variable names were checked on September 26. No Apple Sign in credential variables were present. Add the Sign in with Apple key through secure service settings:

- `APPLE_SIGN_IN_TEAM_ID`: the Apple developer team that owns `com.borrowhood.app`.
- `APPLE_SIGN_IN_KEY_ID`: a key enabled for Sign in with Apple for this app.
- `APPLE_SIGN_IN_PRIVATE_KEY`: that key's PKCS#8 `.p8` contents. Never commit or paste it into review notes or chat.
- Preserve `JWT_SECRET`; it encrypts stored refresh credentials with a separate derivation context. Plan token re-encryption before rotating it. Never discard a key while encrypted revocations are pending.
- Keep `VERIFICATION_PAYMENT_MODE=free_launch` and the IAP product unavailable for sale. Leave physical payment/subscription flags off.

Run `node server/scripts/check-app-review-readiness.js` in the configured service environment. The check is read-only and outputs names/errors, not values. A passing config check does not validate Apple's key permissions: test a real Apple sign-in and deletion on the exact native candidate. Existing builds without authorization codes stay compatible; do not release this correction with credential storage unconfigured.

Check `apple_token_revocations` for oldest creation time and attempts. Repeated failures require checking key validity, team/app association and Apple's availability. Do not manually delete pending rows to silence failures.

## Moderation operation

The owner must ensure authorized admin coverage before launch. Check Profile → Community safety at least daily, prioritize threats and illegal content immediately, and target action on other reports within 24 hours. Review the captured content, remove violating material, suspend abusive accounts when warranted, and record the reason. Do not assume a report automatically removes content or proves abuse. Appeals/support: chris@borrowhood.net. Tests verify the controls, not that a human is monitoring the queue.

## Exact-candidate device walkthrough

Still requires the next signed candidate, after the release hold is lifted:

1. Fresh email/Apple/Google signup and return login. Verify code delivery (including Yahoo spam), resend cooldown, AutoFill and incorrect/expired-code recovery.
2. Town search, no nearby neighborhoods, join, skip/back, Stripe cancel/failure/retry, background/resume. No permanent spinner. No payment sheet during free launch.
3. Report text and a photo from an unverified Town preview, then verify admin evidence/removal. Confirm the client never obtains the masked author ID. Block from a reply and verify its count and deep link disappear.
4. New neighborhood membership receives no older chat. A removed member needs Steward approval; a departing Steward must hand off a populated neighborhood.
5. Delete both a new Apple-linked account and a legacy Apple account. Confirm app credentials/Face ID storage are cleared, account data disappears and Apple revocation completes (or the disclosed legacy fallback appears). Exercise a provider outage and retry.
6. iPhone and iPad: keyboard layouts, large text, VoiceOver, portrait/landscape, clean install, signed-in restart and flaky networking.

## App Store Connect items not yet verified

The shared App Store Connect session was signed out during the audit. The selected review build, current reviewer credentials, privacy answers, age rating, product state, screenshots and existing rejection thread have not been read or changed in this fix. Do not mark them approved based on code tests. Use the exact candidate's accurate screenshots and a working, preconfigured reviewer account in App Review Information; supply a second account if needed for exchanging/reporting. A reviewer must be able to explore ordinary app functions without submitting personal ID. Explain any verified demonstration account honestly in the review notes.

Draft notes: `docs/app-review-notes-next-update.txt`. Replace the build/reviewer-account details in App Store Connect only after the actual candidate passes the walkthrough. No purchase approval or Apple acceptance is claimed here.

## References

- https://developer.apple.com/app-store/review/guidelines/ (1.2, 2.1, 2.3.1, 3.1.1, 5.1.1)
- https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
- https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/
