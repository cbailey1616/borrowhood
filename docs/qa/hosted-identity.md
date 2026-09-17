# Hosted identity verification

Stripe Identity remains available through the existing authenticated
`POST /api/auth/verify-identity` endpoint. The app opens the returned Stripe URL
in the system browser and checks `GET /api/identity/status` on return. Closing
the browser does not grant verification; only the server response determines
whether the check was submitted or verified.

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
