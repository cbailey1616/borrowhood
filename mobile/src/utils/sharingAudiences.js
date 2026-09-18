// New posts reach every available audience. Saved choices are never expanded.
export function availableSharingAudiences({ friendsAvailable, neighborhoodAvailable, townAvailable }) {
  return [
    friendsAvailable && 'close_friends',
    neighborhoodAvailable && 'neighborhood',
    townAvailable && 'town',
  ].filter(Boolean);
}
