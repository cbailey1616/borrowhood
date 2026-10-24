# Android development and release

Android shares the mobile React Native/Expo app and the existing API with iOS.

## Build a test APK

From mobile, run `npx eas-cli@24.2.0 build --platform android --profile android-preview`.
This uses the existing Borrowhood EAS project and its managed Android signing key.
The release-mode APK includes its JavaScript and uses the production API.
Android checks export the bundle and generate the native project for every PR
changing mobile code. Native compilation is verified separately by EAS Build.

## Live Android development

Build `android-development` once for the installed native dependencies. It uses
the existing EAS signing key so installing it over the preview preserves app data.
Save its APK as work/android-tools/borrowhood-development.apk in the local task
workspace. The mobile/scripts/start-android-emulator.command launcher then prefers
this build and connects it to Metro on port 8097 over adb reverse. JavaScript and
artwork changes can subsequently reload without a native rebuild. Rebuild when
native dependencies or configuration change.

This profile and launcher explicitly use the production API. Use an isolated
backend/account for automated tests that create exchanges or send messages.

## Google services still required

1. Register Android package `com.borrowhood.app` in the Borrowhood Firebase project.
2. Add the EAS signing certificate SHA-1 and SHA-256 to the Android app registration.
3. Store the downloaded Android configuration as the EAS production file variable
   `GOOGLE_SERVICES_JSON`. For local development only, use mobile/google-services.json.
4. Configure the matching FCM V1 service credential in EAS for push delivery.
5. Register the package/signing SHA-1 OAuth Android client in the existing Google
   project. Keep the existing web client ID used by the API.
6. Rebuild and verify Google sign-in, permission denial/re-enabling, background
   notifications and cold-start notification navigation on a physical device.

Without Firebase, test APKs skip push registration. Inbox content is still loaded
through the API. A successful build alone does not establish feature readiness.
Do not commit Firebase admin keys, Play service-account keys, or signing keys.

## Google Play

The account owner completes account registration, agreements, payment and identity
verification. Configure the app's listing, privacy/data-safety declarations and
testing requirements. Use the Google Play app-signing certificate as well as the
EAS upload certificate for production Google sign-in and Android App Links.

The `android-store` profile builds an AAB. The matching submit profile targets
internal testing. Before using it, configure the Google Play submission credential
in EAS, complete the initial Play Console upload/setup, connect Firebase, and
verify the complete borrowing, messaging, report and return flows. Publishing to
production is a separate release action.
