export const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function requestDatePreset(preset, now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(from);
  if (preset === 'weekend' && from.getDay() !== 0) {
    from.setDate(from.getDate() + (6 - from.getDay() + 7) % 7);
    until.setTime(from.getTime()); until.setDate(until.getDate() + 1);
  }
  return { neededFrom: localDate(from), neededUntil: localDate(until) };
}
export function requestAudienceProblem(visibility, friends, verified) {
  if (!visibility?.length) return 'Choose who can see your request.';
  if (visibility.includes('town') && !verified) return 'Verify your identity before asking your town.';
  if (visibility.every(scope => scope === 'close_friends')) {
    if (friends.loading) return 'Checking who can see your request…';
    if (friends.error) return 'Could not check your friends. Try again before posting.';
    if (friends.count === 0) return 'You haven’t added any friends yet. Nobody else would see this request.';
  }
  return null;
}
