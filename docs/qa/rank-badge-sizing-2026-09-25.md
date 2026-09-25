# Rank badge sizing

Rank badges beside names now use the same icon dimensions as their adjacent verification badge.

| Placement | Both icons |
| --- | --- |
| Feed, friend rows, request details | 16px |
| Own profile, request queue | 18px |
| Neighbor profile | 20px |

`NeighborRankBadge` accepts a size, and `MemberSummary` passes the size used by each identity row. Existing artwork, centered alignment, rank-detail navigation, and 44px rank tap targets are preserved.

Verification: 63 existing tests passed across FeedScreen, MemberSummary, and VerifiedBadge. A React Native Web fixture rendered the actual badge components for all six rank states and both profile sizes. At 320px and 393px, each pair had matching width/height and no horizontal overflow. Native popup adapters were isolated; this was not a device capture or a TestFlight release.

[Component preview](rank-badge-sizing-2026-09-25.png)
