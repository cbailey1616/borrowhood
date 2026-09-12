// The display and explanation share the same rank bands.
export const NEIGHBOR_RANKS = [
  { label: 'Outlaw', tone: 'Needs work', icon: 'rank-outlaw', min: 0, max: 59 },
  { label: 'Jester', tone: 'Fair', icon: 'rank-jester', min: 60, max: 74 },
  { label: 'Archer', tone: 'Good', icon: 'rank-archer', min: 75, max: 89 },
  { label: 'Ranger', tone: 'Great', icon: 'rank-ranger', min: 90, max: 96 },
  { label: 'Robin', tone: 'Excellent', icon: 'rank-robin', min: 97, max: 100 },
];
export const NEW_NEIGHBOR_RANK = { label: 'New neighbor', icon: 'neighbor-sprout' };
export const RATING_UNLOCK_EXCHANGES = 3;

export function reputationRank(score) {
  if (!Number.isFinite(score)) return NEW_NEIGHBOR_RANK;
  return [...NEIGHBOR_RANKS].reverse().find(rank => score >= rank.min) || NEIGHBOR_RANKS[0];
}

export function memberReputation(user) {
  const endorsement = user.endorsement;
  const completedCount = Number.isFinite(endorsement?.completedCount)
    ? endorsement.completedCount : user.totalTransactions;
  const isNew = Number.isFinite(completedCount) && completedCount >= 0 && completedCount < RATING_UNLOCK_EXCHANGES;
  const rank = isNew ? NEW_NEIGHBOR_RANK
    : Number.isFinite(endorsement?.score) ? reputationRank(endorsement.score) : null;
  return { completedCount, isNew, rank };
}
