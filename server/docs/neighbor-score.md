# Neighbor Rating

Profiles and request queues place the existing woodland rank emblem beside the
member's name and verification mark. Completed exchanges sit directly below the
name, with no separate rating section. Tapping the emblem opens the qualitative
rating, rank name, and levels. Members can see their own rating. No numeric
scores, percentages, or score ranges appear in the member summary or explanation.

## New Neighbors

Show "New neighbor" until the third completed exchange. It is a temporary status,
not a sixth tier. All three exchanges contribute when the rating becomes visible;
feedback is not required to graduate. The starting internal score is 75 (Good).

Count actual returned/completed exchange records, excluding unsettled authorized
payments, rather than relying on the cached user transaction counter. A returned
exchange that later becomes completed still counts once. Pending, active,
disputed, and cancelled exchanges do not advance the three-exchange requirement.

## Internal Calculation

| Outcome received | Total contribution per completed exchange |
|---|---|
| Positive | +3 |
| Negative | -3 |
| Neutral or unrated | +1 |

There is no additional completion point on a rated exchange. Feedback replaces
the initial +1 contribution: before limits apply, positive feedback changes the
current total by +2 and negative feedback by -4. Neutral feedback leaves the
initial +1 unchanged. The other participant's rating is independent.

Transaction-only contributions are capped at 14 points, so activity without
positive feedback cannot lift a member past Good. The internal calculation is:

`points = 75 + min(neutral_or_unrated_completed, 14) + 3 * positive - 3 * negative`

`score = completed_count >= 3 ? clamp(points, 0, 100) : null`

Examples: three unrated exchanges score 78; three positive exchanges score 84;
three negative exchanges score 66; three positive and three negative score 75.
This is a product model, not a validated prediction of future behavior or a
financial credit score. Stored histories are recomputed, not incremented on reads
or resubmissions. Existing exchanges and feedback are preserved.

| Hidden score | Rating | Rank |
|---|---|---|
| 0-59 | Needs work | Outlaw |
| 60-74 | Fair | Squire |
| 75-89 | Good | Archer |
| 90-96 | Great | Ranger |
| 97-100 | Excellent | Robin |

The explanation shows only the five qualitative tiers and their emblems,
highlights the current tier, and says "Build your rank with positive exchanges."
New members see "Rating after 3 completed exchanges" and no selected tier. It
does not disclose point rules or detailed eligibility rules.

## Feedback And Compatibility

Each eligible exchange permits one immutable response per participant within the
existing 14-day window. Feedback applies immediately; closing that window does
not remove earlier contributions. Accepted cancellations remain eligible for
positive/negative feedback (+3/-3) but earn no completion/activity point and do
not count toward graduation. Pending cancellations remain ineligible. Self
exchanges and nonparticipant feedback are excluded.

The API retains `endorsement.percent` and `endorsement.count` for older clients,
with their original positive/negative-only meanings. `endorsement.score` is null
before graduation. The new `endorsement.completedCount` is authoritative for
graduation and displayed completion counts. Older counters are only a client
fallback. Missing rating data or a legacy percentage is not interpreted as a
new-model rating; established members see "Rating unavailable" in that case.

Account and public profiles refresh on return. The mobile change and server
change must both be deployed for the new calculation and graduation to take
effect. Historical feedback is preserved.

## Tier Notifications

The server checks tiers once a minute. The first rating after three completed
exchanges, upgrades, and downgrades appear in Inbox Activity. Only upgrades send
push, respecting the global push and borrowing/lending preferences. Alerts show
no numeric score, individual vote, or rater identity. Tapping an alert opens the
member's current rating explanation from Profile.

Startup creates the tier snapshot table and notification enum values. Existing
members are baselined once without historical alerts. A snapshot and its Activity
notification commit together under a row lock, preventing duplicate alerts from
overlapping checks and allowing a failed save to retry. Push is best effort after
commit; a push failure never removes Activity. Multiple changes within a check
interval are represented by the latest tier. No alert is created if that tier is
unchanged. Both server and mobile changes need deployment.
