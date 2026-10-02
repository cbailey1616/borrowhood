# Exchange issue reporting

"Report an issue" now opens an exchange report form with "Item wasn’t returned" and "Item was damaged" instead of opening private chat. Details and up to five photos are optional. Messaging remains its own exchange action.

The form and submission confirmation say:

> Reports are used to review account access and may lead to a ban. Borrowhood does not recover items, cover loss or damage, or resolve disputes.

This is account moderation. It offers no reimbursement, item recovery, repair service, payment claim, or dispute resolution.

## Behavior

- Only exchange participants can submit. Reports refer to the exchange identified by the server.
- Owners can report non-return after the agreed date. Existing 48-hour response, administrator review, duplicate-report handling, appeal, and confirmed non-return restriction rules remain in effect.
- Damage reports appear in the unified administrator Reports dashboard with the description and photo evidence available for review. They do not add a non-return strike or change account access automatically. Administrators can review and ban the reported account.
- Borrowers can disclose damage to the item they borrowed; the record identifies the borrower as both reporter and reported account rather than accusing the owner.
- Photos must belong to the uploader. Report evidence is private to the exchange participants and administrators.
- A damage report prevents the 48-hour automatic return closure. Dismissing the report permits normal automatic closure; an owner can still confirm the actual return.
- Non-return report alerts retain their instructions in Inbox and open the report directly, allowing a response or appeal.
- Repeated taps and network retries do not duplicate the same active report. Failed submissions retain the form.

## Administrator dashboard

Profile → Admin → Reports is the single review entry point for administrators. It combines non-return, damage, and other safety reports, with filters for issue type and Pending / Reviewed / All reports.

- Totals cover the whole queue, including reports beyond the visible page. Counts follow the selected issue filter.
- Appeals appear first, followed by reports ready for review, then non-return reports awaiting the borrower's response.
- Reports awaiting a response show the deadline. A response or an expired response period makes the report ready for review; it does not confirm the allegation or change account access.
- Selecting a report opens that exact report with its evidence and existing decision history, including previously reviewed reports.
- Decisions continue through the existing moderation services and their response periods, notes, explicit confirmation, appeal, and version safeguards.
- Returning to the dashboard refreshes counts and the list. Pagination does not duplicate rows if their positions shift.
- Both the screen and its API require an administrator account. The dashboard summary exposes no credentials, unrelated messages, or raw photo references.

## Avoiding duplicate reporting

The separate non-return creation form has been removed from Return options. Report an issue on the exchange is the reporting form for both non-return and damage. Return options retains agreed date extensions, return arrangements, and access to existing return reports. Return reports retains responses and appeals. The internal ReturnHelp route and legacy server report endpoint remain compatible with older app versions and notifications.

## Validation

- Mobile: 131 tests passed across the exchange report, exchange detail, return reports, safety reviews, Inbox activity, and notification destination suites.
- Server: 88 tests passed across exchange reports, return recovery, automatic closure, private photos, safety review, and reported content review.
- Expo iOS production bundle exported successfully with Hermes.
- Whitespace check passed.
- Dashboard and redundancy follow-up: 124 mobile tests passed across seven suites, and 45 server tests passed across four suites. These include admin access, combined counts and filtering, cross-queue pagination, selected-report history, stale responses, retry, and the removal of the duplicate form.
- The final iOS production bundle, including the dashboard, exported successfully with Hermes.

The mobile update requires the accompanying server change before it is released. This change has been prepared for the next app update; it has not been deployed or uploaded to TestFlight.

## Blocking visibility follow-up

Blocking now denies listing and Wanted-post access through the canonical audience rules, town previews, saved/direct links and live offers, even if a prior exchange otherwise granted listing access. Feed, public replies, neighborhood chat and new-message blocking retain their existing protections. Existing conversations, exchange records, return/report evidence and moderation access remain available; blocking does not erase previously shared records.

The blocked member cannot open the blocker's full profile or ratings. User search, suggestions, contact matching, friends and pending friend requests exclude blocked relationships in either direction. New friendship requests and acceptance are denied for blocked relationships. The initiating member retains access to the other profile so the Unblock action remains reachable. Protected profile photos also enforce the block; historical message/evidence permissions remain intact.

Profile safety rows, block confirmation and success messages, content safety actions and Privacy & Safety explain profile/post visibility and the existing-exchange exception. Profile refresh removes previously displayed data after a 403/404 access denial.

Validation: all 616 server privacy tests across 49 suites passed, including both block directions, audience access, previews, private offer/transaction bypass prevention, direct profiles, search/contact/friend discovery, unblock restoration and existing exchange records. All 24 focused mobile tests across three suites passed, including block confirmation copy and removing a profile after access is revoked. Changes remain local and have not been released.
