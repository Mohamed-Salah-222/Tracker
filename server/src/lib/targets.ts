import { Settings } from "../models/Settings";

export type DayTargets = {
  target: number;
  minimum: number;
  isWeekend: boolean;
};

// Pure helper: given a date and settings values, return that day's target/minimum.
export function dayTargets(
  date: Date,
  s: {
    weekdayTargetUSD: number;
    weekdayMinimumUSD: number;
    weekendTargetUSD: number;
    weekendMinimumUSD: number;
  },
): DayTargets {
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  return {
    target: isWeekend ? s.weekendTargetUSD : s.weekdayTargetUSD,
    minimum: isWeekend ? s.weekendMinimumUSD : s.weekdayMinimumUSD,
    isWeekend,
  };
}

// Count weekdays/weekends in a [start, end) UTC range.
export function countDays(start: Date, endExclusive: Date) {
  let weekdays = 0;
  let weekends = 0;
  const cur = new Date(start);
  while (cur < endExclusive) {
    const dow = cur.getUTCDay();
    if (dow === 0 || dow === 6) weekends++;
    else weekdays++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { weekdays, weekends };
}

// "Expected" target/minimum across a month, derived from weekday/weekend counts.
export function monthExpected(
  year: number,
  monthZeroBased: number, // 0-11
  s: {
    weekdayTargetUSD: number;
    weekdayMinimumUSD: number;
    weekendTargetUSD: number;
    weekendMinimumUSD: number;
  },
) {
  const start = new Date(Date.UTC(year, monthZeroBased, 1));
  const end = new Date(Date.UTC(year, monthZeroBased + 1, 1));
  const { weekdays, weekends } = countDays(start, end);
  return {
    expectedTarget: weekdays * s.weekdayTargetUSD + weekends * s.weekendTargetUSD,
    expectedMinimum: weekdays * s.weekdayMinimumUSD + weekends * s.weekendMinimumUSD,
    weekdays,
    weekends,
  };
}

// Convenience: load settings once.
export async function loadSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}
