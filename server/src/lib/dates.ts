// Calendar days are stored as UTC midnight so all "same day" comparisons match.
//
// The client sends plain "YYYY-MM-DD" strings built from the user's *local*
// calendar (see client/src/lib/today.ts). Read the calendar fields straight off
// the string rather than routing them through instant arithmetic: an
// offset-bearing timestamp like "2026-07-29T01:00:00+03:00" is UTC 2026-07-28,
// but the day the sender meant is 2026-07-29. Taking the leading date as written
// keeps the stored day equal to the day the user saw, at any UTC offset.
const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export function toDayUTC(input: Date | string): Date {
  if (typeof input === "string") {
    const match = DATE_PREFIX.exec(input.trim());
    if (match) {
      const [, year, month, day] = match;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
  }
  // No wall-clock date to read (a Date instance, or a non-ISO string): the only
  // day available is the UTC one.
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function monthRange(year: number, month: number) {
  // month is 1-12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}
