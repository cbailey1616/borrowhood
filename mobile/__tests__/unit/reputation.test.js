import { memberReputation, NEIGHBOR_RANKS, NEW_NEIGHBOR_RANK, reputationRank } from '../../src/utils/reputation';

it.each([
  [0, 'Outlaw', 'Needs work'], [59, 'Outlaw', 'Needs work'],
  [60, 'Jester', 'Fair'], [74, 'Jester', 'Fair'],
  [75, 'Archer', 'Good'], [89, 'Archer', 'Good'],
  [90, 'Ranger', 'Great'], [96, 'Ranger', 'Great'],
  [97, 'Robin', 'Excellent'], [100, 'Robin', 'Excellent'],
])('maps hidden score %i to %s and %s', (score, label, tone) => {
  expect(reputationRank(score)).toMatchObject({ label, tone });
});

it('keeps New neighbor out of the five rating tiers', () => {
  expect(NEIGHBOR_RANKS).toHaveLength(5);
  expect(NEIGHBOR_RANKS).not.toContain(NEW_NEIGHBOR_RANK);
});

it.each([0, 1, 2])('keeps a member new at %i completed exchanges even with feedback', completedCount => {
  const result = memberReputation({ totalTransactions: 50, endorsement: { completedCount, score: 84, count: 2, percent: 100 } });
  expect(result).toEqual({ completedCount, isNew: true, rank: NEW_NEIGHBOR_RANK });
});

it('unlocks a rating on the third completed exchange without waiting for feedback', () => {
  expect(memberReputation({ totalTransactions: 0, endorsement: { completedCount: 3, score: 78, count: 0, percent: null } }))
    .toMatchObject({ completedCount: 3, isNew: false, rank: { label: 'Archer', tone: 'Good' } });
});

it.each([{}, { totalTransactions: 8 }, { totalTransactions: 8, endorsement: { percent: 100, count: 8 } }])
  ('does not invent a rating from missing data or a legacy percentage', user => {
    expect(memberReputation(user).rank).toBeNull();
  });

it('can use the existing transaction counter with an older score response', () => {
  expect(memberReputation({ totalTransactions: 5, endorsement: { score: 90 } }))
    .toMatchObject({ completedCount: 5, isNew: false, rank: { label: 'Ranger' } });
});
