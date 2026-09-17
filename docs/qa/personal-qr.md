# Personal QR codes

Entry: Friends → Add → My QR code. The code opens the member's profile; the scanner taps Add friend to send a normal request. Share profile opens the system share sheet with the same link. A pending request reads Request sent, and becomes Friends after acceptance. Existing incoming requests offer Accept request.

The QR is generated on-device with a white quiet zone. It contains only the profile ID in an HTTPS link. The public landing page contains no account information and does not send or accept requests.

## Release order

Deploy the server before installing the new native build. These routes must be live on `borrowhood-production.up.railway.app`:

- `/.well-known/apple-app-site-association`: JSON, HTTP 200, no redirect; app ID `8H5NL2H27M.com.borrowhood.app`, path `/people/*`.
- `/people/<UUID>`: browser fallback with Open Borrowhood and Get Borrowhood.
- Authenticated `GET /api/users/:id`: includes the viewer's friendship status.

The app adds the API host to both Expo and native iOS associated domains, and registers the existing `borrowhood` scheme in the tracked Info.plist. A new native binary is required. The code and browser fallback use the existing authenticated profile and friend request APIs.

## Device acceptance on the next build

1. On one phone, open My QR code. Use another phone's camera to scan it with Borrowhood open, then with Borrowhood closed. Both should open that person's profile with working back navigation.
2. Scan while signed out. Sign in or complete onboarding; the profile should open afterward. Scanning alone must not send a request.
3. Tap Add friend. Confirm Request sent remains after leaving and reopening the profile, then becomes Friends after acceptance on the other phone.
4. Open the shared link in a browser. Verify the fallback opens the app. Scan your own code and confirm there is no Add friend action.

Automated checks cover parsing, app readiness, deferred navigation, request states, API fallback and app association. The rendered SVG was decoded independently at 200, 240 and 280 pixels. Native camera and universal-link acceptance still need the deployed server and new TestFlight binary.
