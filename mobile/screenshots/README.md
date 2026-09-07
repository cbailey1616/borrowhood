# Borrowhood App Store screenshots

This capture target uses the actual native app screens with fictional posts,
neighbors, and messages. It runs separately from the TestFlight entry point.
It has no production API fallback, sign-in, or live database seeding.

The App Store set contains six portrait PNGs per device: Home, Giveaway,
For Sale, Saved, My Posts, and Messages. Screens are captured at native size:

- iPhone 16 Pro Max: 1320 × 2868 pixels.
- iPad Pro 13-inch (M4): 2064 × 2752 pixels.

The capture script exports RGB PNGs without transparency or resizing.
Review every image before uploading to App Store Connect. The photos are
sample listing images from Unsplash; source URLs are in `assets.json`.

Apple's specifications:
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

## Capture on a Mac

Run `python3 screenshots/prepare-assets.py` from `mobile`, install the locked
Node and CocoaPods dependencies, then build for an iOS simulator in Release
with `BORROWHOOD_SCREENSHOTS=1` and `ENTRY_FILE` set to the absolute path of
`screenshots/index.js`. This opt-in Metro configuration replaces only the
auth context and API for the screenshot bundle. Normal builds use `App.js`
and production modules.

Run `python3 screenshots/capture.py /path/to/Borrowhood.app /path/to/output`
with Pillow installed. The hosted workflow performs these same steps and
provides an artifact with both device folders and a capture manifest.
