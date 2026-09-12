# Feed indicators and scrolling ribbon

Requested behavior: a green dot above Home for new feed posts; a green unread-message count above Inbox; hide the top feed ribbon while scrolling down and reveal it while scrolling up. Retain the pink Saved heart and the layered feed. This batch also includes the pending Comments keyboard-spacing fix and simplified popup surfaces.

- Home checks the newest visible post from another member. It excludes private inventory, other towns without access, completed sales/giveaways, inactive listings and ended requests using the feed's current access rules. A lightweight summary avoids fetching photos or ranking the feed during polling.
- A successful, visible, unfiltered first-page refresh acknowledges new feed posts. Failed loads and filtered searches do not clear the dot. Last-visited state is stored separately for each account.
- Inbox counts unread messages only. Updates refresh on incoming/opened notifications, foregrounding, returning from a conversation and active-app polling. Opening Inbox does not mark conversations as read. Failed refreshes retain the last count; older responses cannot restore stale counts. Counts over 99 display as 99+.
- The feed uses React Native's native scrolling sticky-header behavior, with a fixed status-bar inset. The ribbon stays visible while the search field has focus. Tapping Home again returns to the top without replacing posts. Feed notices scroll with content and are excluded from impression events.
- Returning from a post, incoming notifications, and foregrounding the app keep the current posts, request carousel, loaded pages, and ranking session. Saved hearts and account/exchange notices can update independently. Pull-to-refresh starts a fresh ranking session and loads the latest posts; search and filter changes still load the explicitly requested result set. The Home dot announces new posts until they are loaded.
- Comments uses the measured native viewport and docked keyboard frame to keep its composer above the keyboard. Threads use the native back arrow to return to Comments.

Targeted mobile checks cover indicators, delayed responses, account changes, storage races, filter/read behavior, search, ribbon controls, comments and popups. CI must pass its full mobile/iOS bundle and isolated server/database gates before merge. The local full mobile run exposed one test fixture whose AppState was a mock function; the fixture now explicitly represents a foreground app.

Native scrolling and keyboard appearance still require an iPhone/simulator check. The connected Mac was unavailable during this session, so no new native build or TestFlight submission is claimed. The inline ribbon preview uses sample content and illustrates the requested states.

Feed-stability follow-up (2026-09-12): 45 checks passed across FeedScreen, useInboxBadges, and useSavedListings. Regression coverage includes returning from a post after pagination, keeping the ranking session for the next page, deferring incoming posts until manual refresh, foregrounding, Home re-taps, and starting a fresh order on pull-to-refresh.
