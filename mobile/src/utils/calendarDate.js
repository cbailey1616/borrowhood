// Agreed pickup/return dates are calendar days, even when the API serializes
// a SQL DATE as midnight UTC. Event timestamps must continue using new Date.
export function parseCalendarDate(value) {
  if (!value) return null;
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (parts && (date.getFullYear() !== Number(parts[1]) || date.getMonth() !== Number(parts[2]) - 1 || date.getDate() !== Number(parts[3]))) return null;
  return date;
}

export function formatCalendarDate(value, options) {
  return parseCalendarDate(value)?.toLocaleDateString(undefined, options) || '';
}
