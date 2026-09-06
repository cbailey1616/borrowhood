# Local UI testing

## Review directly on the Mac

From `/Users/chrisbailey/Borrowhood-Local/mobile`, run:

```sh
npm ci
npm run ui:mac
```

Open `http://localhost:8092` in Safari or Chrome. Keep the terminal open.
The page is labeled **LOCAL PREVIEW · UI 04**. It displays the actual shared
Feed, Saved, My Items, Activity, Profile, listing detail, and chat screens in
a phone-sized frame. Use the sidebar to inspect all icons and woodland ranks,
switch to empty states, or reset the sample data. Edits refresh the preview.

This is a design preview with sample people and items. It does not sign in,
store credentials, contact the live API, or send real messages. The browser
resolves `App.web.js`, `api.web.js`, and `AuthContext.web.js`; native builds
continue using their original entry point, API, and authentication provider.
Native sign-in, camera, push notifications, keyboard behavior, and borrowing
still need an iPhone check. Other destinations explain that they need the app.

Web setup follows [Expo's web workflow](https://docs.expo.dev/workflow/web/).

## Review on an iPhone

Use an iPhone development build for UI work. Install it once, then Metro serves
the JavaScript from your Mac and Fast Refresh updates the app after edits.
Expo Go cannot run all of Borrowhood's native integrations. Xcode is only needed
if you want to compile locally or use the iOS Simulator.

## First install

From the `mobile` folder:

```sh
npm ci
npx eas-cli device:create
npx eas-cli build --platform ios --profile development-device
```

Open the registration link on the iPhone and finish the device registration
before starting the build. Install the completed build from its Expo link.
Enable Developer Mode in iPhone Settings → Privacy & Security if prompted.
This build uses the existing app identifier, so it replaces the TestFlight
installation on that phone. You can reinstall TestFlight later.

The checked-in native iOS project already integrates Expo modules and supports
the `com.borrowhood.app` URL scheme. EAS installs the new development-client
pods when building. Do not run `expo prebuild --clean` over this native project.

## Each UI session

Connect the Mac and iPhone to the same Wi-Fi. In `mobile`, run:

```sh
npm run ui
```

Open the installed development app and scan the terminal QR code with the iPhone
camera (or enter the printed server address in the development launcher).
Allow local network access when prompted. Keep the Mac awake and the terminal
open. Changes to screens, spacing, colors, icons and chat UI refresh as files are
saved. Shake the phone to open the developer menu if Fast Refresh needs enabling.

To identify the current preview, open Profile. The development-only banner reads
`Local preview · UI 04` with `Woodland style, softer chat & original ranks` underneath.
TestFlight/release builds do not show this banner. The friendly icons live in
`src/assets/borrowhood-icons.js`; `components/Icon.js` renders them with the
already-installed Expo Image SVG decoder, so artwork changes need no native build.

`npm run ui` uses the hosted Borrowhood backend: accounts, listings and messages
are real. Use test accounts for interactive checks. New backend endpoints still
need a backend deployment, or a local server, before they can be tested.

To use a separately running local backend on a physical iPhone:

```sh
EXPO_PUBLIC_API_URL=http://YOUR_MAC_LAN_IP:3001 npm run dev
```

Use `http://localhost:3001` only for a simulator. Restart Metro after changing
the API environment variable. Release builds always use the production API.

## When to build again

UI and JavaScript changes only need Metro. Rebuild the development client when
adding or upgrading native libraries, changing native settings/permissions, or
upgrading Expo. Use TestFlight for periodic release checks after the UI review.

If the phone cannot connect, check Wi-Fi, VPN/firewall settings and Borrowhood's
Local Network permission. Press `r` in Metro to reload. `npm run ui -- --clear`
clears the bundler cache. Metro must run from the checkout containing the edits.

References: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
and [using a development build](https://docs.expo.dev/develop/development-builds/use-development-builds/).
