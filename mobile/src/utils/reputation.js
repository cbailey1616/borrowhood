// The woodland rank labels the same Neighbor Score; it is not a second rating.
export function reputationRank(score) {
  if (!Number.isFinite(score)) return { label: 'New neighbor', icon: 'rank-squire' };
  if (score >= 97) return { label: 'Robin', icon: 'rank-robin' };
  if (score >= 90) return { label: 'Ranger', icon: 'rank-ranger' };
  if (score >= 75) return { label: 'Archer', icon: 'rank-archer' };
  if (score >= 60) return { label: 'Squire', icon: 'rank-squire' };
  return { label: 'Outlaw', icon: 'rank-outlaw' };
}
