# Native popup rehearsal

This fixture imports the real popup layer, action sheet, global error provider,
themed alerts and audience picker. It uses a native-stack posting modal and a
nested native Modal. No account, backend or production data is involved.

Prerequisites: a Mac with Xcode, installed mobile dependencies, an iOS simulator,
and the Borrowhood development simulator client (bundle `com.borrowhood.app`).
The release rehearsal used iPhone 17 Pro / iOS 26.5 and development client
`255b58e3-1e01-411c-85c2-ccfb1748cc24`.

1. Run `python3 mobile/qa/native-popups/prepare.py` from the repository root.
   It prints a new temporary directory containing `app` and `native`.
2. In its `app` directory, run
   `CI=1 npx expo start --dev-client --localhost --port 8083`.
   Stop only a previous rehearsal using this port if necessary.
3. Install/open the development client in the simulator. Select
   `http://localhost:8083` in its development-server list. No sign-in is needed.
4. In the temporary `native` directory, run:
   `xcodebuild test -project PopupChecks.xcodeproj -scheme PopupChecks -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' -resultBundlePath results.xcresult`
   Replace `SIMULATOR_UDID` with the chosen simulator's ID. Each result-bundle
   path must be new.

The touch sequence checks three neighborhood open/cancel cycles, confirmation
and error callbacks above a posting modal, confirmation above a nested native
modal, Join/Create navigation and return to the still-open draft, and final
posting dismissal. An attachment captures the global popup above the posting
sheet. Both destination screens must remain modal, matching the production
`fromPosting` route options; using card presentation reproduced a blank return.

Build 217: the complete sequence passed on September 6, 2026. XCTest waited for
two iOS animation-idle timeouts around the global error, then successfully tapped
and dismissed it; the whole sequence took 169 seconds. This tests these native
presentation paths, not every application screen or physical-device provider
integration. The fixture and Swift test preserve the passing rehearsal; the
portable preparation helper was added afterward.
