import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import { toast } from "sonner";
import { getApiError } from "../lib/food";
import { HabitGlyph } from "./HabitGlyph";

type HeatDay = { date: string; percent: number | null; done: number; judged: number };
type MonthRow = { key: string; label: string; percent: number | null; done: number; judged: number };
type HabitRow = {
  key: string;
  label: string;
  icon: string;
  done: number;
  judged: number;
  skipped: number;
  firstSeen: string | null;
  percent: number | null;
};

type Recap = { today: string; heatmap: HeatDay[]; months: MonthRow[]; habits: HabitRow[] };

/** Five steps of grey. A percentage is a quantity, so it gets a ramp, not a hue. */
function shade(percent: number | null): string {
  if (percent === null) return "var(--color-muted)";
  if (percent >= 90) return "#18181b";
  if (percent >= 70) return "#52525b";
  if (percent >= 45) return "#a1a1aa";
  if (percent > 0) return "#d4d4d8";
  return "var(--color-muted)";
}

export default function DashboardRecapModal({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const [data, setData] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    api
      .get<Recap>("/dashboard/recap", { params: { today: todayISO(), months: 12 } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(getApiError(e)))
      .finally(() => setLoading(false));
  }, [open, data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[860px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>The long view</DialogTitle>
        </DialogHeader>

        {loading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-[120px] rounded-xl" />
            <Skeleton className="h-[80px] rounded-xl" />
            <Skeleton className="h-[200px] rounded-xl" />
          </div>
        ) : (
          <div className="space-y-5">
            <Heatmap days={data.heatmap} />
            <Months rows={data.months} />
            <Habits rows={data.habits} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A year of days, one square each, oldest first and read down each column like a
 * calendar. The grid answers "how is this month", this answers "how has it been".
 */
function Heatmap({ days }: { days: HeatDay[] }) {
  // Pad the front so every column is one Monday-to-Sunday week.
  const first = new Date(days[0].date + "T00:00:00Z").getUTCDay();
  const lead = first === 0 ? 6 : first - 1;
  const cells: (HeatDay | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  const weeks: (HeatDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const tracked = days.filter((d) => d.percent !== null);
  const perfect = tracked.filter((d) => d.percent === 100).length;

  return (
    <section aria-label="The last year">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">The last year</h3>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {tracked.length} days tracked · {perfect} of them clean
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day, di) => (
                <span
                  key={day?.date ?? `pad-${wi}-${di}`}
                  title={day ? (day.percent === null ? `${day.date}: nothing tracked` : `${day.date}: ${day.done} of ${day.judged}`) : ""}
                  className="h-[11px] w-[11px] rounded-[2px]"
                  style={{ backgroundColor: day ? shade(day.percent) : "transparent" }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>less</span>
        {[0, 30, 60, 80, 100].map((p) => (
          <span key={p} className="h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: shade(p) }} />
        ))}
        <span>more</span>
      </div>
    </section>
  );
}

function Months({ rows }: { rows: MonthRow[] }) {
  const scored = rows.filter((r) => r.percent !== null);
  const best = Math.max(...scored.map((r) => r.percent ?? 0), 1);
  return (
    <section aria-label="Month by month">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Month by month</h3>
      {scored.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not enough history yet.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((row, i) => {
            const prev = rows[i - 1]?.percent ?? null;
            const delta = row.percent !== null && prev !== null ? row.percent - prev : null;
            return (
              <div key={row.key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{row.label}</span>
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${row.percent === null ? 0 : Math.round((row.percent / best) * 100)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums font-semibold">{row.percent === null ? "-" : `${row.percent}%`}</span>
                <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{delta === null ? "" : delta === 0 ? "same" : delta > 0 ? `+${delta}` : delta}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Habits({ rows }: { rows: HabitRow[] }) {
  return (
    <section aria-label="Every habit">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Every habit, all time</h3>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2 rounded-lg px-1 py-1">
            <HabitGlyph name={row.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="w-28 shrink-0 truncate text-[12px] font-medium">{row.label}</span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground" style={{ width: `${row.percent ?? 0}%` }} />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums font-semibold">{row.percent === null ? "-" : `${row.percent}%`}</span>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="Days done out of days it could have been done">
              {row.done}/{row.judged}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Counted from the first day each habit was tracked. A day you deliberately skipped is left out of both sides rather than counted against you.
      </p>
    </section>
  );
}
