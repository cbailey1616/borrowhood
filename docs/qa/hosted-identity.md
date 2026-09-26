# Hosted identity verification

Stripe Identity remains available through the existing authenticated
`POST /api/auth/verify-identity` endpoint. The app opens the returned Stripe URL
in the system browser and checks `GET /api/identity/status` on return. Closing
the browser does not grant verification; only the server response determines
whether the check was submitted or verified.

The September 26 production failure was Stripe's `url_invalid` rejection of the
`return_url`: an app scheme was sent directly to the hosted flow. New sessions
now use `https://borrowhood-production.up.railway.app/verification-complete`.
That public page resumes `borrowhood://verification-complete`, with an Open
Borrowhood link if automatic return is unavailable. It carries no session data,
ignores query parameters, and never grants verification. Build 270 already
listens for this app callback, so the correction requires only a backend deploy.

The return page permits only its nonce-bound script/styles under CSP and is not
cached. Session creation keeps its existing transaction lock, eligibility checks,
and idempotency keys. Stripe does not persist idempotency results for request
validation errors, so the rejected request can be retried after this correction.

The native Identity package also included StripeCore, which links PassKit even
without the Payments SDK. All native Stripe packages and their resource bundles
are now removed. The hosted flow keeps document capture with Stripe and avoids
shipping those unused payment-framework dependencies.

Automated checks cover trusted HTTPS URLs, cancellation, spoofed completion
callbacks, processing/verified results, stale navigation, and both verification
entry screens. Native build validation must also check that the final app has
no Stripe or PassKit linkage.

Device acceptance: start verification from Profile and onboarding, cancel and
retry, finish the document/selfie check, return to Borrowhood, and confirm that
processing does not display a verified badge. An unfinished native session can
still be resumed by the existing server endpoint; close the browser after
submission if that older session has no return URL.

References:
- https://docs.stripe.com/identity/verify-identity-documents?platform=web&type=redirect
- https://docs.expo.dev/versions/latest/sdk/webbrowser/
- https://docs.stripe.com/api/idempotent_requests
