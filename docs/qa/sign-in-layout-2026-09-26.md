# Sign-in layout — September 26, 2026

Prepared locally for the next app build, using the user's GitHub sign-in reference. No app build, OTA update, GitHub push or backend deployment was made.

## Changes

- Email and password are immediately available on the welcome screen, with password recovery beside the password label and a forest-green Sign in button.
- The existing Borrowhood hat-and-feather logo appears above the wordmark on a small cream circle. Fields have distinct borders and a white focused state against parchment.
- Google then Apple appear beneath an “or” divider. Both provider controls are 48 points tall with 8-point corners. Apple continues to use the native AppleAuthenticationButton; its typeface is controlled by iOS.
- Returning members with stored credentials retain a compact, sage Face ID/Touch ID option. New members get a separate Create an account link.
- Login routes reached from registration or password recovery reuse the same screen and retain back navigation and Find account.
- Keyboard submission signs in once; password and biometric login are locked while another sign-in is pending. Social-account linking and recovery retain the existing flows.

## Verification

32 tests passed across WelcomeScreen, LoginScreen and SocialSignInButtons. Coverage includes email validation/sign-in, keyboard submission and duplicate taps, account creation/recovery navigation, Apple/Google linking and cancellation, provider busy states, and biometric approval versus cancellation. `git diff --check` passed.

An isolated web preview export of the real screen compiled successfully with mock authentication and native-control stand-ins. No production entry point or build configuration was changed. Visual inspection could not be completed: the cloud browser environment denied starting the local preview server, and its URL policy disallowed local file navigation. No alternate browser/control surface was used to bypass that restriction.

The image shown in chat is an illustrative design mockup. Native Apple label sizing, small-phone scrolling, larger accessibility text and keyboard behavior still require visual review on the next device build.
