// Date strings across the app are plain calendar days ("YYYY-MM-DD"), and every
// helper that shifts one (shiftDay, mondayOfWeek, ...) parses it as UTC midnight
// and formats it back with toISOString() — that arithmetic is self-consistent and
// stays as-is.
//
// The one value that must NOT come from UTC is the seed: "what day is it right
// now?". Reading it off new Date().toISOString() reports the *previous* day
// whenever local time is ahead of UTC — in Africa/Cairo (UTC+2/+3) that is every
// day between local midnight and 02:59. Anything the UI labels "today" is the
// user's local calendar day, so derive it from the local clock.

export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayISO(): string {
  return toLocalISODate(new Date());
}
