# Borrowhood App Store screenshots

This capture target uses the actual native app screens with fictional posts,
neighbors, and messages. It runs separately from the TestFlight entry point.
It has no production API fallback, sign-in, or live database seeding.

The App Store set contains six portrait PNGs per device: Home, Giveaway,
For Sale, Saved, My Posts, and Messages. Screens are captured at native size:

- iPhone 13 Pro Max: 1284 × 2778 pixels (the requested 6.5-inch upload size).
- iPad Pro 13-inch (M4): 2064 × 2752 pixels.

The capture script exports RGB PNGs without transparency or resizing.
The `ui-review` folders also contain notification settings and rated/unrated
profiles on iPhone Pro Max and iPhone SE. These review images are separate
from the six-image App Store set and include both on and off switch states.
They also show the same compact request carousel with a photo request and
a short service request in front, to check spacing and consistent height.
Review every image before uploading to App Store Connect. The photos are
sample listing images from Unsplash; source URLs are in `assets.json`.

Apple's specifications:
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

## Capture on a Mac

Run `python3 screenshots/prepare-assets.py` from `mobile`, install the locked
Node and CocoaPods dependencies, then build for an iOS simulator in Release
with `BORROWHOOD_SCREENSHOTS=1` and `ENTRY_FILE` set to the absolute path of
`screenshots/index.js`. This opt-in Metro configuration replaces only the
auth context, API, notification permissions/delivery, and temporary draft store for the screenshot bundle. Normal builds use `App.js`
and production modules.

Run `python3 screenshots/capture.py /path/to/Borrowhood.app /path/to/output`
with Pillow installed. The hosted workflow performs these same steps and
provides an artifact with both device folders and a capture manifest.

The workflow can reuse a previous simulator binary from an ancestor commit when
its native project and dependency files are unchanged. It rebuilds the JavaScript
bundle with the current fixtures before capturing. New native changes or expired
artifacts trigger a fresh native build.
