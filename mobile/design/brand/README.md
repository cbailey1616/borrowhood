# Borrowhood app mark

Approved in chat on September 6, 2026. Created with the built-in image-generation tool, then exported at the platform sizes. Both generated source PNGs are retained here.

- `robin-hood-icon-source.png`: approved hat and feather on parchment.
- `robin-hood-mark-source.png`: transparent export for the launch screen, verification branding, and Android adaptive foreground.
- App icon: `../../src/assets/icon.png`, 1024 × 1024, opaque RGB; identical copy in the iOS AppIcon asset catalog.
- Launch mark: `../../src/assets/splash.png`; native iOS assets are 200/400/600 pixels for a centered 200-point mark. Background is the app's parchment `#F3EBDD`.
- Android foreground: 1024 × 1024 with additional transparent padding for adaptive masks; background `#F3EBDD`.
- Verification branding: `../../assets/logo.png`, 256 × 256 transparent mark.

Design prompt: replace the aged Borrowhood scroll and lettering with one friendly, crisp Robin Hood cap on warm parchment. Use a sage crown, folded forest-green brim, one honey-gold feather, and confident rounded forest outlines. Keep balanced safe margins and a clear silhouette at home-screen size. No text, borders, distressed paper, bevels, shadows, or ornamental extras.

Transparent export prompt: remove only the parchment background from the approved icon, preserving the hat, feather, colors, geometry, orientation, and safe margins; output actual alpha transparency.

Production exports use Lanczos resizing. The adaptive foreground resizes the transparent source to 768 square and pads each edge by 128 pixels. No artistic changes are made to the approved source during export.

The home-screen icon and native launch screen require a new app binary; an Expo JS update cannot replace them.
