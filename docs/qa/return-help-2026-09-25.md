# Return Help Follow-Up

## Purpose

Return help now supports arranging the handoff, agreeing on more time, and resolving missing-return reports. Borrowers no longer arrive at an empty report list with no useful action.

## Behavior

| State | Main action | Other available actions |
| --- | --- | --- |
| Borrower, item picked up | Message owner | Ask about more time; open exchange to record return |
| Owner, item picked up | Message borrower | Extend the agreed date; open exchange to confirm receipt |
| Owner, overdue return | Message borrower | Extend date; report missing return if no existing report blocks it |
| Borrower, return pending | Message owner | Check the exchange; no repeat return or extension prompt |
| Owner, return pending | View exchange to confirm receipt | Message borrower; applicable owner return options |
| Returned or completed | View exchange | Message neighbor; no extension or new missing-return report |
| Profile entry point | View my exchanges | Review, respond to, or appeal existing reports |
| Deleted neighbor account | View exchange for existing support flow | No broken messaging action |

- Item photo or existing illustrated fallback, compact wrapping title, and neighbor context on a single card, with no offset backing layer.
- Sage status surface for normal returns; amber date/status for overdue returns.
- Explicit filled primary action and grouped icon rows with 44px-or-larger touch targets.
- Ordinary returns have no empty reports footer, report-refresh button, or reports-policy link. Report controls appear when a report exists; policy remains available for an existing restriction and administrative review. Pull-to-refresh still updates the screen.
- Owner-only mutations, report/review confirmations, response versions, appeals, review permissions, and restriction policy remain enforced.
- Chat reuses the existing conversation and listing context. Asking for time never sends a message or changes the date automatically.
- Refresh on focus updates status after returning from the exchange. Pull-to-refresh preserves the visible details and disables actions during loading.
- Fetch failures display a retry, not a false empty-report success state.

## Date extension follow-up

- Give more time has a calendar heading, clearly labeled current and new dates, and one filled Save return date button. Saving no longer opens a second generic confirmation sheet.
- The native iOS picker uses a light, themed spinner with a Done control instead of an unstyled compact date pill. Android retains its native date dialog.
- The report list and policy link are hidden while choosing a date so they do not compete with the form.
- The picker only offers dates after the existing deadline, on or after today, and within the server's 90-day limit. Limits use calendar-day arithmetic across daylight-saving changes. An already exhausted date range cannot be submitted.
- Saving locks editing and duplicate submissions. Failures keep the chosen date editable; cancellation discards the draft; success names the date saved and reloads the exchange.

## Extension notifications

- Saving an extension already persists a borrower-facing Return date updated notification with the exchange destination and queues push delivery in the same database transaction. Push delivery respects notification preferences.
- Fixed return-reminder deduplication to include the agreed date. An alert for an earlier deadline no longer consumes the reminder for an extended deadline.
- Delivery rechecks the current date and exchange status before sending a queued return reminder. Old-date reminders and stale today/tomorrow messages are suppressed, including jobs created before the new date metadata was added.
- The borrower is reminded the day before; borrower and owner are reminded on the due day. The hourly scheduler only handles items still picked up.
- This reminder fix requires a server deployment; it has not been deployed from this workspace.

## Verification

- Initial return-page redesign: full mobile suite passed, 144 suites / 1,315 tests.
- Focused Return Help, exchange, guidance, and calendar-date coverage also run in `America/New_York`.
- Final date extension follow-up: 3 focused suites / 51 tests passed in `America/New_York`, covering explicit saves, date bounds, calendar-day changes, duplicate taps, failed saves, cancellation, report confirmation, and the other return states.
- Single-card / footer simplification: all 22 Return Help screen tests passed. Updated previews were checked again at 320, 393, and 768px; pull-to-refresh and existing report responses remain available.
- Extension notifications: 70 server tests passed across notification reliability, return recovery, and notification preferences. Database-backed regression cases cover legacy and new notification keys, today/tomorrow reminders after extensions, repeated scheduler runs, queued obsolete pushes, and the borrower’s extension alert. The push provider was mocked; no real notifications were sent.
- Final production iOS/Hermes export passed. The export reported an unavailable Android `google-services.json`; it did not prevent the iOS bundle from exporting.
- Full suite emitted React `act(...)` warnings in untouched auth/push-notification tests; all tests passed.
- Playwright reviewed the actual screen source through React Native Web at widths 320, 393, and 768px with long item names. No horizontal overflow or out-of-bounds/undersized action buttons were found in borrower, owner, overdue-owner, pending-return, or completed states. The date extension form also passed at 320px; selecting and saving a different date updated the status in the fixture.
- Native-only adapters, navigation, API, and date picker were isolated for browser review. A browser date input stands in for the native picker for interaction checks; it is closed in the previews. Screenshots use synthetic neighbors and a missing-photo fixture, not production account data.
- Physical iPhone/iPad, Dynamic Type, VoiceOver, and native date-picker checks remain pending. No TestFlight build was submitted for this follow-up.

## Previews

- [Borrower](return-help-2026-09-25/borrower.png)
- [Narrow phone](return-help-2026-09-25/borrower-narrow.png)
- [Overdue owner](return-help-2026-09-25/owner-overdue.png)
- [Owner](return-help-2026-09-25/owner.png)
- [Awaiting owner confirmation](return-help-2026-09-25/awaiting-owner.png)
- [Completed return](return-help-2026-09-25/completed.png)
- [Extend return date](return-help-2026-09-25/extend-date.png)
- [Extend date on a narrow phone](return-help-2026-09-25/extend-date-narrow.png)
- [Saved return date](return-help-2026-09-25/date-saved.png)
