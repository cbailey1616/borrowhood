// A requested calendar day ends in the creator's timezone, not at UTC midnight.
export const requestActiveSql = (alias, now = 'NOW()') => `(${alias}.status = 'open'
  AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > ${now})
  AND (${alias}.needed_until IS NULL OR ${alias}.needed_until >= (${now} AT TIME ZONE ${alias}.time_zone)::date))`;

export function validRequestTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 100) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; }
  catch { return false; }
}
