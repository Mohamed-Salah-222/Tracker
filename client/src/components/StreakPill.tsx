import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import { loadStreak, type StreakResponse } from "../lib/streak";

/**
 * The run, in the nav, where it is always in view.
 *
 * A streak you have to go and look up is not a nudge. This sits under the links and
 * says two things: how long the run is, and whether today has been counted yet, which
 * is the only part that is actionable.
 *
 * It reads the streak rather than reporting one, so opening the app is what counts,
 * not looking at this.
 */
export function StreakPill({ onNavigate }: { onNavigate?: () => void }) {
  const [data, setData] = useState<StreakResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void loadStreak()
        .then((r) => !cancelled && setData(r))
        .catch(() => {
          /* The nav must render with or without a number in it. */
        });
    };
    read();
    // The ping that counts today usually lands just after this first read, and coming
    // back to the tab is the other moment the answer may have changed.
    const settle = setTimeout(read, 2500);
    document.addEventListener("visibilitychange", read);
    return () => {
      cancelled = true;
      clearTimeout(settle);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  if (!data) return null;

  return (
    <Link
      to="/badges"
      onClick={onNavigate}
      aria-label={`Streak: ${data.current} ${data.current === 1 ? "day" : "days"}, ${data.usedToday ? "counted today" : "not counted today yet"}`}
      className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 transition-colors hover:bg-muted"
    >
      <Flame className={`h-4 w-4 shrink-0 ${data.usedToday ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={2.1} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-sm font-semibold leading-none tabular-nums">
          {data.current} <span className="text-[11px] font-normal text-muted-foreground">{data.current === 1 ? "day" : "days"}</span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] leading-none text-muted-foreground">{data.usedToday ? "counted today" : "not counted yet"}</span>
      </span>
    </Link>
  );
}
