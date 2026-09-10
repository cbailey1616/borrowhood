# Neighbor Score

The public member summary shows one score from 0 to 100, identity verification,
and completed exchanges. Its woodland rank is a label for this same score,
rather than a separate activity rating. Members do not see their
own score in their account or public profile response.

The initial model blends the observed positive-feedback rate with a starting
prior of 75 over five equivalent rated exchanges:

`score = round(100 × (positive + 3.75) / (positive + negative + 5))`

No positive or negative feedback means no numeric score: show “New”. Two positive
responses score 82; twenty score 95; forty-five positive and five negative score
89. This calibration limits the confidence implied by a tiny feedback history.
It is a product model, not a validated prediction of a member's future behavior.

| Score | Rank |
|---|---|
| No scored feedback | New neighbor |
| 0–59 | Outlaw |
| 60–74 | Squire |
| 75–89 | Archer |
| 90–96 | Ranger |
| 97–100 | Robin |

The existing woodland emblems are reused, with Outlaw at the bottom and Ranger
shortening Sherwood Ranger. Own profiles show neither score nor its rank.

Each eligible exchange allows one immutable response per participant. Positive
and negative responses count immediately. Neutral feedback is stored as an
explicit null vote and contributes to neither the numerator nor denominator.
Unrated exchanges also have no score weight. Completed exchanges remain visible
as context; they are not automatically treated as positive feedback.

The existing 14-day window for submitting feedback remains. There is no delayed
publication window. Accepted cancellations remain eligible; pending cancellations
do not. Previously submitted positive and negative feedback is included in the
new calculation, and migration 021 preserves those votes.

The API keeps `endorsement.percent` and `endorsement.count` for older clients and
adds `endorsement.score`. Updated clients display the single Neighbor Score when
available. If connected to an older server, they retain the accurately labeled
endorsement percentage until the server is updated.
