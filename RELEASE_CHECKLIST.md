# First-borrow release

## Implemented
- One welcome screen, then a town form; no contact, neighborhood, payment or identity setup required to browse.
- Town form supports manual entry and optional device location. Precise coordinates are not sent by this form.
- Debounced search ignores stale responses. Empty states distinguish no matches, no town, no inventory and request failures.
- An unsuccessful search can prefill a wanted-item title. Empty towns offer listing and friend-invitation entry points.
- Listing creation leads with photos and title. Category, description and condition controls are optional details. The default condition is explicitly disclosed, and visibility stays visible before publication.
- Transactions have role-specific next-step guidance, one cancellation control per state and safe-area padding on action footers.
- Reviews, completed exchanges and verified identity are emphasized. Ranks explicitly describe activity, not safety.
- Admin-only aggregate reporting: Profile → App insights. No new admin grants. GET /api/insights/funnel?days=30 supports 1–365 days.
- Approval timestamps are retained going forward; existing status data supplies historical counts. Report definitions and historical limitations are displayed.

## Automated validation
Run `cd server && npx vitest run --config vitest.free-launch.config.js`.
Run `cd mobile && npx expo export --platform ios --platform android`.
The isolated tests do not connect to a database or Stripe. Full existing mobile Jest initialization remains a separate known issue.

## Physical-device checks still required
The connected Mac lacks `xcrun simctl`; no simulator visual result is claimed.
- On a small iPhone and with larger text, complete the two-screen signup without location permission.
- Enter a town manually, dismiss the keyboard, and reach the feed without a neighborhood or contacts.
- Search for no matches, clear search/filters, post a prefilled request, then retry in airplane mode.
- List with a photo/title and the disclosed defaults. Expand optional details and change condition before posting.
- Borrower and lender: request → approve → private pickup arrangements → pickup → return → review.
- Confirm pending returns and disputes do not read as a completed exchange.
- Check images of portrait and landscape items; verify the original full photo remains available in item details.
- Check the rank legend at large text and footer buttons above the home indicator.
- Admin report: refresh counts after a completed exchange; ordinary users must receive HTTP 403.

No physical-device visual review has yet been completed for this release.

## Parchment and chat follow-up
- Warm parchment backgrounds and cream surfaces replace the cool white palette.
- Chat refresh reconciles acknowledged messages by ID and keeps chronological order.
- First sends activate conversation polling; failed sends retain composer text; refresh does not force readers to the bottom.
- New-message indicator, loading send button, photo attachment target and message refresh errors added.
- Verify chat on a physical device: keyboard, long drafts, photos, reactions, deletion, read receipts, offline failure and reading older messages during receipt.
- 25 isolated checks pass, including stale polling, deduplication, read receipts and deletion reconciliation.
