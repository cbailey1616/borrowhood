# Non-return closure

Implemented locally; not deployed or included in TestFlight build 293.

- Participant exchange list/detail responses include report summaries. Damage summaries are private to their author; non-return summaries are visible to both participants. No moderation notes/evidence are exposed here.
- Active reports are clearly labeled. Existing reports can be reopened without submitting duplicates.
- Free lending exchanges with an unresolved non-return report close as `closed_unreturned` after the report's 48-hour response window. Scheduler checks every five minutes. No automatic allegation confirmation, account restriction or ban occurs from closure.
- Owner-confirmed receipt before closure completes the exchange normally and resolves the non-return report through the existing trigger. A borrower claim alone does not override an unresolved owner report.
- Owner-confirmed late returns can complete a closed exchange; retries count once. Borrowers cannot reopen a closed exchange themselves.
- Closure preserves report status, responses, appeals and evidence. It leaves actual return time empty, does not increase successful-borrow counts or enable completion feedback, and keeps missing inventory unavailable.
- A dismissed/resolved report, a future agreed return date, a legacy paid exchange, or a financial dispute prevents this automatic closure. Damage alone does not classify the item as missing.
- Closed exchanges appear in a separate issue-history section. The progress display says Not returned rather than Returned.

Validation:
- 54 passing backend integration tests covering reports, authenticated list/detail endpoints, timers, early/late receipt, duplicate runs, extended deadlines, inventory, report preservation and transactional notification failure/retry.
- 144 passing mobile tests across seven exchange/report/navigation/guidance suites.
- Broader privacy run: 48 suites passed; the exchange-audit fixture lacked the newly queried report tables. Updated that fixture and reran its 14 tests successfully alongside report and closure tests.
- `git diff --check` passed. Native PostgreSQL CI and a signed mobile release remain pending publication.
