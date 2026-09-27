# September 27 feed update

The user approved the designs and requested that all changes from this batch be
pushed on September 27.

## Included

- Report/block is a quiet, accessible link below item and wanted-post details.
  The existing reporting flow and block confirmation remain available.
- The feed has the approved woodland banner, hat logo, serif wordmark, and
  evenly spaced themed icons above the category labels.
- Six bundled woodland scenes cycle on successful sign-in or restored sign-in
  after a fresh launch. Each account's place is saved on the device. Feed
  refreshes, tab changes, and profile updates retain the current scene.
- Unseen posts receive stronger ranking priority. Recently viewed posts receive
  no discovery boost for one day, then gradually recover it over six days.
  A fresh feed session applies this ranking to the existing bounded candidate
  windows. The current session retains its order and scroll position, and seen
  posts remain available through paging, search, and filters.

## Verification

- 133 focused mobile tests passed across feed, details/reporting, icons, header,
  search, authentication, scrolling, and scene rotation.
- 18 focused server checks passed for ranking, feed privacy, and windowed
  pagination. HTTP coverage includes seen events, stable current-session order,
  rotation on refresh, account-specific cooldowns, and access through search.
- All six scene previews were rendered and inspected. The category row was
  checked at widths 320, 375, 402, and 768.
- Full mobile tests/iOS asset export and native database/privacy/rehearsal checks
  remain required in CI before merge and the signed TestFlight build.

The previews use the actual React Native components through the web renderer.
On the next compiled build, check the header, scrolling, report/block placement,
and a fresh sign-in on an iPhone. This batch does not change App Store review
metadata or submit a new production-review request.
