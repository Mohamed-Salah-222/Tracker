/**
 * Turning a day and a wall clock into an instant, and back.
 *
 * A task's date is a calendar day the whole app agrees on and its time is what the
 * clock reads, but a reminder has to be an absolute moment or the server would need
 * to know which timezone you were standing in when you set it. The conversion happens
 * here, once, in the browser that knows the answer.
 *
 * In its own file because these are functions rather than components, and mixing the
 * two in one module costs fast refresh.
 */
export function instantFrom(dayIso: string, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const local = new Date(`${dayIso}T00:00:00`);
  local.setHours(hours, minutes, 0, 0);
  return local;
}

/** The wall clock a stored instant lands on, for putting back into a time input. */
export function clockOf(instant: string): string {
  const at = new Date(instant);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** Shift a wall clock back by some minutes, staying within the same day's reading. */
export function minutesBefore(dayIso: string, time: string, minutes: number): string {
  const at = instantFrom(dayIso, time);
  at.setMinutes(at.getMinutes() - minutes);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}
