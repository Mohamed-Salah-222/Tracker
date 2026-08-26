import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { AlertTriangle, Award, Cake, ChevronLeft, ChevronRight, Droplet } from "lucide-react";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { toast } from "sonner";
import { BarSeries, StackedBarSeries } from "./MiniChart";
import { MEALS, MEAL_LABELS, getApiError, round, round1, shiftDay, type Meal } from "../lib/food";

type DaySummary = {
  date: string;
  isCheat: boolean;
  cal: number;
  p: number;
  c: number;
  f: number;
  water: number;
  byMeal: Record<Meal, number>;
};

type WeekSummary = {
  startDate: string;
  endDate: string;
  days: DaySummary[];
  totals: { cal: number; p: number; c: number; f: number; water: number; byMeal: Record<Meal, number> };
  avg: { cal: number; p: number; c: number; f: number; water: number };
  trackedCount: number;
  cheatDayCount: number;
  bestDay: DaySummary | null;
  worstDay: DaySummary | null;
  goalAttainment: {
    calorieGoalDays: number;
    proteinGoalDays: number;
    carbsGoalDays: number;
    fatGoalDays: number;
    waterGoalDays: number;
    totalTrackedDays: number;
  };
  goal: {
    caloriesTarget: number;
    proteinTarget: number;
    carbsTarget: number;
    fatTarget: number;
    waterMin: number;
    waterTarget: number;
    waterMax: number;
  };
};

/** The tracking week runs Friday to Thursday. */
function fridayOnOrBefore(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 5 + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const dayInitial = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayLong = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** Three greys, darkest first, so the stack reads without colour. */
const MACRO_SEGMENTS = [
  { label: "Protein", color: "var(--color-workout-upper)" },
  { label: "Carbs", color: "var(--color-workout-lower)" },
  { label: "Fat", color: "var(--color-workout-rest)" },
];

// =====================================================================
// MAIN
// =====================================================================
export function CalorieRecapModal({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [anchor, setAnchor] = useState(() => fridayOnOrBefore(todayISO()));
  const [data, setData] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Stepping between weeks used to refetch every time; serving the cached week
  // instantly and revalidating behind it makes the arrows feel immediate.
  const cache = useRef<Record<string, WeekSummary>>({});

  useEffect(() => {
    if (open) setAnchor(fridayOnOrBefore(todayISO()));
  }, [open]);

  const load = useCallback(async () => {
    if (!open) return;
    const cached = cache.current[anchor];
    if (cached) setData(cached);
    setLoading(true);
    try {
      // The previous week used to be fetched alongside this one and then thrown
      // away — the state setter was never read. That request is gone.
      const r = await api.get<WeekSummary>("/calories/week-summary", { params: { startDate: anchor } });
      cache.current[anchor] = r.data;
      setData(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [open, anchor]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel = useMemo(() => {
    const start = new Date(anchor + "T00:00:00Z");
    const end = new Date(shiftDay(anchor, 6) + "T00:00:00Z");
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const left = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const right = end.toLocaleDateString("en-US", { month: sameMonth ? undefined : "short", day: "numeric", timeZone: "UTC" });
    return `${left} – ${right}`;
  }, [anchor]);

  const isCurrentWeek = anchor === fridayOnOrBefore(todayISO());

  const calorieBars = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => ({
      key: d.date,
      label: dayInitial(d.date),
      value: d.cal,
      color: d.isCheat ? "var(--color-workout-rest)" : d.cal > data.goal.caloriesTarget ? "var(--color-workout-lower)" : "var(--color-workout-upper)",
      tooltip: [dayLong(d.date), `${round(d.cal)} cal${d.isCheat ? " · cheat day" : d.cal > data.goal.caloriesTarget ? " · over target" : ""}`, MEALS.map((m) => `${MEAL_LABELS[m][0]} ${round(d.byMeal[m])}`).join("  ")],
    }));
  }, [data]);

  const macroBars = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => ({
      key: d.date,
      label: dayInitial(d.date),
      values: [d.p, d.c, d.f],
      muted: d.cal === 0,
      tooltip: [dayLong(d.date), `P ${round1(d.p)}g · C ${round1(d.c)}g · F ${round1(d.f)}g`],
    }));
  }, [data]);

  const waterBars = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => ({
      key: d.date,
      label: dayInitial(d.date),
      value: d.water,
      color: d.water >= data.goal.waterMin ? "var(--color-workout-upper)" : "var(--color-workout-rest)",
      tooltip: [dayLong(d.date), `${(d.water / 1000).toFixed(2)} L`, d.water >= data.goal.waterMin ? "minimum met" : "below minimum"],
    }));
  }, [data]);

  const noData = !data || data.trackedCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[820px] sm:!w-[calc(100vw-3rem)] max-h-[92svh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Weekly calorie recap</DialogTitle>

        {/* Solid, not blurred: a backdrop-filter on a sticky element repaints every scroll frame. */}
        <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weekly recap · Fri to Thu</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-base font-semibold tracking-tight">{rangeLabel}</span>
                {loading && data && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted border-t-muted-foreground" aria-label="Refreshing" />}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Previous week" onClick={() => setAnchor(shiftDay(anchor, -7))}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Next week" disabled={isCurrentWeek} onClick={() => setAnchor(shiftDay(anchor, 7))}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-5">
          {loading && !data ? (
            <div className="space-y-4" aria-busy="true">
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[68px] rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : noData ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Cake className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="text-base font-semibold">Nothing logged this week</div>
              <p className="mt-1 text-sm text-muted-foreground">Log a few meals and the week fills in here.</p>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
                <StatCard label="Avg calories" value={round(data!.avg.cal).toLocaleString("en-US")} sub={`of ${data!.goal.caloriesTarget}`} />
                <StatCard label="Avg protein" value={`${round1(data!.avg.p)}`} sub={`of ${data!.goal.proteinTarget}g`} />
                <StatCard label="Avg water" value={`${(data!.avg.water / 1000).toFixed(2)}`} sub="litres" />
                <StatCard label="Days tracked" value={`${data!.trackedCount}/7`} sub={data!.cheatDayCount > 0 ? `${data!.cheatDayCount} cheat` : "no cheat days"} />
              </div>

              <Card>
                <CardContent className="px-4 py-0">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Days on target ({data!.goalAttainment.totalTrackedDays} tracked)</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-5">
                    <GoalProgress label="Calories" hit={data!.goalAttainment.calorieGoalDays} total={data!.goalAttainment.totalTrackedDays} />
                    <GoalProgress label="Protein" hit={data!.goalAttainment.proteinGoalDays} total={data!.goalAttainment.totalTrackedDays} />
                    <GoalProgress label="Carbs" hit={data!.goalAttainment.carbsGoalDays} total={data!.goalAttainment.totalTrackedDays} />
                    <GoalProgress label="Fat" hit={data!.goalAttainment.fatGoalDays} total={data!.goalAttainment.totalTrackedDays} />
                    <GoalProgress label="Water" hit={data!.goalAttainment.waterGoalDays} total={data!.goalAttainment.totalTrackedDays} />
                  </div>
                </CardContent>
              </Card>

              {(data!.bestDay || data!.worstDay) && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {data!.bestDay && <DayCallout type="best" day={data!.bestDay} target={data!.goal.caloriesTarget} />}
                  {data!.worstDay && <DayCallout type="worst" day={data!.worstDay} target={data!.goal.caloriesTarget} />}
                </div>
              )}

              <Card>
                <CardContent className="px-4 py-0">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Calories per day</div>
                    <div className="font-mono text-[10px] tabular-nums text-muted-foreground">target {data!.goal.caloriesTarget}</div>
                  </div>
                  <BarSeries points={calorieBars} height={200} />
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-[10px] text-muted-foreground">
                    <Legend swatch="var(--color-workout-upper)" label="On target" />
                    <Legend swatch="var(--color-workout-lower)" label="Over" />
                    <Legend swatch="var(--color-workout-rest)" label="Cheat day" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="px-4 py-0">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Macros per day (g)</div>
                  <StackedBarSeries points={macroBars} segments={MACRO_SEGMENTS} height={200} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="px-4 py-0">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Droplet className="h-3 w-3" aria-hidden />
                      Water per day (ml)
                    </div>
                    <div className="font-mono text-[10px] tabular-nums text-muted-foreground">minimum {data!.goal.waterMin}</div>
                  </div>
                  <BarSeries points={waterBars} height={168} />
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Pieces
// =====================================================================
function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="px-3 py-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 truncate font-mono text-lg font-semibold tabular-nums">{value}</div>
        {sub && <div className="font-mono text-[10px] tabular-nums text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function GoalProgress({ label, hit, total }: { label: string; hit: number; total: number }) {
  const pct = total > 0 ? Math.round((hit / total) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[11px] font-medium">{label}</span>
        <span className="font-mono text-[11px] font-semibold tabular-nums">
          {hit}
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DayCallout({ type, day, target }: { type: "best" | "worst"; day: DaySummary; target: number }) {
  const isBest = type === "best";
  const Icon = isBest ? Award : AlertTriangle;
  const delta = round(day.cal - target);

  return (
    <Card style={isBest ? { boxShadow: "inset 3px 0 0 0 var(--color-foreground)" } : undefined}>
      <CardContent className="px-4 py-0">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" aria-hidden />
          {isBest ? "Best day" : "Toughest day"}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{dayLong(day.date)}</span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {round(day.cal)}
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">cal</span>
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
          {delta === 0 ? "exactly on target" : delta > 0 ? `${delta} over target` : `${Math.abs(delta)} under target`} · P {round1(day.p)} C {round1(day.c)} F {round1(day.f)}
        </div>
      </CardContent>
    </Card>
  );
}
