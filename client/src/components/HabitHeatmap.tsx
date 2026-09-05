import { useMemo, useState } from "react";
import { CELL_CLASS, STATE_LABEL, type HabitDay } from "../lib/habitStats";

/**
 * A year of one habit, a column per week.
 *
 * Read down a column for a week and across a row for a weekday, which is what makes
 * the shape of a habit visible: the Mondays that never happen, the fortnight that fell
 * apart, the run that is still going. Squares rather than a chart, because the answer
 * to "how has this been going" is a pattern, not a number.
 */
const DAY_ROWS = ["S", "M", "T", "W", "T", "F", "S"];

export function HabitHeatmap({ days, startsOn }: { days: HabitDay[]; startsOn: number }) {
  const [picked, setPicked] = useState<HabitDay | null>(null);

  /**
   * Padded to whole weeks so every column has seven cells. Without it the first
   * column starts partway down and every weekday row is off by a day or two.
   */
  const columns = useMemo(() => {
    if (days.length === 0) return [];
    const lead = (new Date(days[0].date + "T00:00:00Z").getUTCDay() - startsOn + 7) % 7;
    const padded: (HabitDay | null)[] = [...Array<null>(lead).fill(null), ...days];
    while (padded.length % 7 !== 0) padded.push(null);
    const out: (HabitDay | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) out.push(padded.slice(i, i + 7));
    return out;
  }, [days, startsOn]);

  const monthTicks = useMemo(() => {
    const seen = new Set<string>();
    return columns.map((week) => {
      const first = week.find(Boolean);
      if (!first) return "";
      const month = first.date.slice(0, 7);
      if (seen.has(month)) return "";
      seen.add(month);
      // Only label a month whose start actually falls in this column.
      return Number(first.date.slice(8, 10)) <= 7 ? MONTHS[Number(first.date.slice(5, 7)) - 1] : "";
    });
  }, [columns]);

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]">
          <div className="mr-1 flex shrink-0 flex-col gap-[3px] pt-[13px]">
            {DAY_ROWS.map((_, row) => (
              <span key={row} className="h-[11px] w-3 text-[8px] leading-[11px] text-muted-foreground">
                {row % 2 === 1 ? DAY_ROWS[(row + startsOn) % 7] : ""}
              </span>
            ))}
          </div>
          {columns.map((week, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              <span className="h-3 text-[8px] leading-3 text-muted-foreground">{monthTicks[i]}</span>
              {week.map((day, j) =>
                day === null ? (
                  <span key={j} className="h-[11px] w-[11px]" />
                ) : (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setPicked(day)}
                    title={`${day.date}: ${STATE_LABEL[day.state]}`}
                    aria-label={`${day.date}, ${STATE_LABEL[day.state]}`}
                    className={`h-[11px] w-[11px] rounded-[2px] transition-transform hover:scale-125 ${CELL_CLASS[day.state]} ${
                      picked?.date === day.date ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""
                    }`}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {(["done", "excused", "missed", "off"] as const).map((state) => (
          <span key={state} className="flex items-center gap-1">
            <span className={`h-[9px] w-[9px] rounded-[2px] ${state === "off" ? "ring-1 ring-inset ring-border" : ""} ${CELL_CLASS[state]}`} />
            {STATE_LABEL[state]}
          </span>
        ))}
      </div>

      {picked && (
        <p className="mt-2 border-t border-border pt-2 text-[11px]">
          <span className="font-mono tabular-nums">{picked.date}</span> <span className="font-semibold">{STATE_LABEL[picked.state]}</span>
          {picked.amount !== null && <span className="text-muted-foreground"> · {picked.amount}</span>}
          {picked.note && <span className="block text-muted-foreground">{picked.note}</span>}
        </p>
      )}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
