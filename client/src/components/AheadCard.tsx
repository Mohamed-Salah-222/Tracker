import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { KIND_LABEL, loadAhead, whenLabel, type Ahead } from "../lib/ahead";

/**
 * What is coming.
 *
 * Every module knew something about the next few days and none of it was ever in one
 * place: the charge on the 1st, the goal that ends on Friday, the task at three, the
 * things that have run out. The app recorded the past well and said nothing about
 * what was about to happen.
 *
 * Deliberately short. This is a glance on the way past, not a second calendar, so it
 * shows a handful and links to the page that owns each one.
 */
const MAX_SHOWN = 6;

export function AheadCard({ today, days = 7 }: { today: string; days?: number }) {
  const [data, setData] = useState<Ahead | null>(null);

  const load = useCallback(() => {
    void loadAhead(today, days)
      .then(setData)
      .catch(() => setData(null));
  }, [today, days]);

  useEffect(load, [load]);

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Coming up</h2>
          </div>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">next {days} days</span>
        </div>

        <div className="mt-2 divide-y divide-border">
          {items.slice(0, MAX_SHOWN).map((item, i) => (
            <Link key={`${item.kind}-${item.title}-${i}`} to={item.url} className="flex items-center gap-3 py-2 transition-colors hover:bg-muted/40">
              <span
                className={`w-16 shrink-0 text-[10px] font-bold uppercase tracking-wider ${
                  item.daysAway !== null && item.daysAway < 0 ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {whenLabel(item)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{item.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {KIND_LABEL[item.kind]}
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
              </span>
              {item.time && <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{item.time}</span>}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>

        {items.length > MAX_SHOWN && <p className="mt-2 text-[11px] text-muted-foreground">and {items.length - MAX_SHOWN} more</p>}
      </CardContent>
    </Card>
  );
}
