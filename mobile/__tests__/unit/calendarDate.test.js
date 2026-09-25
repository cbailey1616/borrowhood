import { parseCalendarDate, formatCalendarDate } from '../../src/utils/calendarDate';
import { borrowGuidance } from '../../src/utils/borrowStatus';

describe('agreed calendar dates', () => {
  // Run in America/New_York as well as UTC: midnight UTC is the previous day there.
  it.each(['2026-09-27', '2026-09-27T00:00:00.000Z', '2026-03-08T00:00:00.000Z'])('preserves the agreed day for %s', value => {
    const date = parseCalendarDate(value);
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([year, month, day]);
    expect(formatCalendarDate(value)).toBe(new Date(year, month - 1, day, 12).toLocaleDateString());
  });

  it.each([null, undefined, '', 'not-a-date', '2026-02-30'])('does not invent a date for %s', value => {
    expect(parseCalendarDate(value)).toBeNull();
    expect(formatCalendarDate(value)).toBe('');
  });

  it('uses the same calendar day in return guidance as in date labels', () => {
    const endDate = '2026-09-27T00:00:00.000Z';
    const due = formatCalendarDate(endDate, { weekday: 'short', month: 'short', day: 'numeric' });
    expect(borrowGuidance({ status: 'picked_up', isBorrower: true, endDate }).title).toBe(`Return by ${due}`);
  });
});
