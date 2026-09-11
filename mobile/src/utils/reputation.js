// The display and explanation share the same rank bands.
export const NEIGHBOR_RANKS = [
  { label: 'Outlaw', icon: 'rank-outlaw', min: 0, max: 59 },
  { label: 'Squire', icon: 'rank-squire', min: 60, max: 74 },
  { label: 'Archer', icon: 'rank-archer', min: 75, max: 89 },
  { label: 'Ranger', icon: 'rank-ranger', min: 90, max: 96 },
  { label: 'Robin', icon: 'rank-robin', min: 97, max: 100 },
];
export const NEW_NEIGHBOR_RANK = { label: 'New neighbor', icon: 'rank-squire' };

export function reputationRank(score) {
  if (!Number.isFinite(score)) return NEW_NEIGHBOR_RANK;
  return [...NEIGHBOR_RANKS].reverse().find(rank => score >= rank.min) || NEIGHBOR_RANKS[0];
}
