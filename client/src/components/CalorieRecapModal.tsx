import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { ChevronLeft, ChevronRight, Cake, Award, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { AxiosError } from "axios";
import { toast } from "sonner";

type Meal = "breakfast" | "lunch" | "dinner" | "snack";

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
    waterGoalDays: number;
    totalTrackedDays: number;
  };
  goal: {
    caloriesTarget: number;
    caloriesBuffer: number;
    proteinMin: number;
    proteinMax: number;
    waterMin: number;
    waterTarget: number;
    waterMax: number;
  };
};

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function shiftDay(iso: string, by: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

// Sunday-start
function sundayOfWeek(iso: string) {
  const d = new Date(iso);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

const dayShort = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayLong = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

// =====================================================================
// MAIN
// =====================================================================
export function CalorieRecapModal({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [anchor, setAnchor] = useState(() => sundayOfWeek(new Date().toISOString().slice(0, 10)));
  const [data, setData] = useState<WeekSummary | null>(null);
  const [, setPrevData] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setAnchor(sundayOfWeek(new Date().toISOString().slice(0, 10)));
  }, [open]);

  const prevAnchor = useMemo(() => shiftDay(anchor, -7), [anchor]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [cur, prev] = await Promise.all([api.get<WeekSummary>("/calories/week-summary", { params: { startDate: anchor } }), api.get<WeekSummary>("/calories/week-summary", { params: { startDate: prevAnchor } })]);
      setData(cur.data);
      setPrevData(prev.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [open, anchor, prevAnchor]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = useMemo(() => {
    const start = new Date(anchor);
    const end = new Date(shiftDay(anchor, 6));
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const left = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const right = end.toLocaleDateString("en-US", {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return `${left} – ${right}`;
  }, [anchor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[820px] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Weekly calorie recap</DialogTitle>

        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Weekly recap</div>
              <div className="text-base font-semibold tracking-tight mt-0.5">{label}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(shiftDay(anchor, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(shiftDay(anchor, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <AnimatePresence mode="wait">
            {loading && !data ? (
              <LoadingState />
            ) : !data ? null : data.trackedCount === 0 || (data.totals.cal === 0 && data.totals.water === 0) ? (
              <EmptyState />
            ) : (
              <motion.div key={anchor} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-5">
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Avg / day" value={`${round(data.avg.cal)}`} suffix="cal" />
                  <StatCard label="Total" value={`${round(data.totals.cal)}`} suffix="cal" />
                  <StatCard label="Avg protein" value={`${round1(data.avg.p)}`} suffix="g" />
                  <StatCard label="Avg water" value={`${(data.avg.water / 1000).toFixed(1)}`} suffix="L" />
                </div>

                {data.cheatDayCount > 0 && (
                  <div
                    className="text-xs rounded-md p-3 flex items-center gap-2 border"
                    style={{
                      background: "var(--color-meal-snack-bg)",
                      borderColor: "color-mix(in oklch, var(--color-meal-snack), transparent 70%)",
                      color: "var(--color-meal-snack)",
                    }}
                  >
                    <Cake className="h-3 w-3 flex-shrink-0" />
                    <span>
                      {data.cheatDayCount} cheat {data.cheatDayCount === 1 ? "day" : "days"} excluded from totals.
                    </span>
                  </div>
                )}

                {/* Goal attainment */}
                <Card>
                  <CardContent className="p-5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4">Goals hit ({data.goalAttainment.totalTrackedDays} tracked days)</div>
                    <div className="grid grid-cols-3 gap-4">
                      <GoalProgress label="Calories" hit={data.goalAttainment.calorieGoalDays} total={data.goalAttainment.totalTrackedDays} color="var(--color-income)" />
                      <GoalProgress label="Protein" hit={data.goalAttainment.proteinGoalDays} total={data.goalAttainment.totalTrackedDays} color="var(--color-protein)" />
                      <GoalProgress label="Water" hit={data.goalAttainment.waterGoalDays} total={data.goalAttainment.totalTrackedDays} color="var(--color-water)" />
                    </div>
                  </CardContent>
                </Card>

                {/* Best / Worst day */}
                {(data.bestDay || data.worstDay) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.bestDay && <DayCallout type="best" day={data.bestDay} target={data.goal.caloriesTarget} />}
                    {data.worstDay && data.worstDay.date !== data.bestDay?.date && <DayCallout type="worst" day={data.worstDay} target={data.goal.caloriesTarget} />}
                  </div>
                )}

                {/* Daily calories chart */}
                <Card>
                  <CardContent className="p-5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4">Daily calories</div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.days} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={dayShort} stroke="var(--color-border)" />
                          <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={40} />
                          <Tooltip
                            cursor={{ fill: "color-mix(in oklch, var(--color-muted-foreground), transparent 90%)" }}
                            contentStyle={{
                              background: "var(--color-card)",
                              border: "1px solid var(--color-border)",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                            labelFormatter={(label) => dayLong(label as string)}
                            formatter={(v, _name, p) => {
                              const payload = (p as { payload?: DaySummary }).payload;
                              const isCheat = payload?.isCheat;
                              return [`${round(Number(v))} cal${isCheat ? " (cheat)" : ""}`, "Calories"];
                            }}
                          />
                          {/* Reference line for target — using a dashed bar trick wouldn't work, so we just rely on the visual target zone */}
                          <Bar dataKey="cal" radius={[4, 4, 0, 0]} animationDuration={500}>
                            {data.days.map((d, i) => {
                              const target = data.goal.caloriesTarget;
                              const buffer = data.goal.caloriesBuffer;
                              let color = "var(--color-income)";
                              if (d.isCheat) color = "color-mix(in oklch, var(--color-meal-snack), transparent 40%)";
                              else if (d.cal === 0) color = "var(--color-border)";
                              else if (d.cal > target + buffer) color = "var(--color-expense)";
                              else if (d.cal > target) color = "var(--color-warning)";
                              return <Cell key={i} fill={color} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-income)" }} />
                        On target
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-warning)" }} />
                        In buffer
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-expense)" }} />
                        Over
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "color-mix(in oklch, var(--color-meal-snack), transparent 40%)" }} />
                        Cheat
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Macros donut + Meal breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Macros donut */}
                  <Card>
                    <CardContent className="p-5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Macros (avg per tracked day)</div>
                      <MacrosDonut p={data.avg.p} c={data.avg.c} f={data.avg.f} />
                    </CardContent>
                  </Card>

                  {/* Meal breakdown */}
                  <Card>
                    <CardContent className="p-5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Calories by meal</div>
                      <MealBreakdown byMeal={data.totals.byMeal} trackedCount={data.trackedCount} />
                    </CardContent>
                  </Card>
                </div>

                {/* Day-by-day macro stack */}
                <Card>
                  <CardContent className="p-5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4">Macros by day (grams)</div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.days} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={dayShort} stroke="var(--color-border)" />
                          <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={40} />
                          <Tooltip
                            cursor={{ fill: "color-mix(in oklch, var(--color-muted-foreground), transparent 90%)" }}
                            contentStyle={{
                              background: "var(--color-card)",
                              border: "1px solid var(--color-border)",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                            labelFormatter={(label) => dayLong(label as string)}
                            formatter={(v, name) => [`${round1(Number(v))}g`, String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
                          />
                          <Bar dataKey="p" stackId="a" fill="var(--color-protein)" radius={[0, 0, 0, 0]} animationDuration={500} />
                          <Bar dataKey="c" stackId="a" fill="var(--color-carbs)" radius={[0, 0, 0, 0]} animationDuration={500} />
                          <Bar dataKey="f" stackId="a" fill="var(--color-fat)" radius={[4, 4, 0, 0]} animationDuration={500} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-protein)" }} />
                        Protein
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-carbs)" }} />
                        Carbs
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-fat)" }} />
                        Fat
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-lg font-semibold font-mono tabular-nums mt-1 truncate flex items-baseline gap-1">
          <span>{value}</span>
          {suffix && <span className="text-xs text-muted-foreground font-normal">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function GoalProgress({ label, hit, total, color }: { label: string; hit: number; total: number; color: string }) {
  const pct = total > 0 ? (hit / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span className="text-sm font-semibold font-mono tabular-nums">
          {hit}
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ background: color, height: "100%" }} />
      </div>
    </div>
  );
}

function DayCallout({ type, day, target }: { type: "best" | "worst"; day: DaySummary; target: number }) {
  const isBest = type === "best";
  const color = isBest ? "var(--color-income)" : "var(--color-expense)";
  const Icon = isBest ? Award : AlertTriangle;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-3 w-3" style={{ color }} />
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{isBest ? "Best day" : "Worst day"}</div>
        </div>
        <div className="text-sm font-medium">{dayLong(day.date)}</div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-xl font-semibold font-mono tabular-nums" style={{ color }}>
            {round(day.cal)}
          </span>
          <span className="text-xs text-muted-foreground">cal · {day.cal > target ? `+${round(day.cal - target)}` : `${round(day.cal - target)}`} vs target</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MacrosDonut({ p, c, f }: { p: number; c: number; f: number }) {
  // Calories from each macro
  const pCal = p * 4;
  const cCal = c * 4;
  const fCal = f * 9;
  const total = pCal + cCal + fCal;

  if (total === 0) {
    return <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No data</div>;
  }

  const data = [
    { name: "Protein", value: pCal, color: "var(--color-protein)" },
    { name: "Carbs", value: cCal, color: "var(--color-carbs)" },
    { name: "Fat", value: fCal, color: "var(--color-fat)" },
  ];

  return (
    <div className="h-44 relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={42} outerRadius={66} paddingAngle={2} animationDuration={500}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(v, name) => {
              const num = Number(v);
              return [`${round(num)} cal (${round((num / total) * 100)}%)`, String(name)];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Macros</div>
          <div className="text-sm font-semibold font-mono tabular-nums">{round1(p + c + f)}g</div>
        </div>
      </div>
      <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-3 text-[10px]">
        <span className="flex items-center gap-1" style={{ color: "var(--color-protein)" }}>
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: "var(--color-protein)" }} />P {round1(p)}g
        </span>
        <span className="flex items-center gap-1" style={{ color: "var(--color-carbs)" }}>
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: "var(--color-carbs)" }} />C {round1(c)}g
        </span>
        <span className="flex items-center gap-1" style={{ color: "var(--color-fat)" }}>
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: "var(--color-fat)" }} />F {round1(f)}g
        </span>
      </div>
    </div>
  );
}

function MealBreakdown({ byMeal, trackedCount }: { byMeal: Record<Meal, number>; trackedCount: number }) {
  const total = MEALS.reduce((s, m) => s + byMeal[m], 0);
  return (
    <div className="space-y-2.5">
      {MEALS.map((m, i) => {
        const v = byMeal[m];
        const avg = trackedCount > 0 ? v / trackedCount : 0;
        const pct = total > 0 ? (v / total) * 100 : 0;
        const widthPct = Math.max(pct, 2);
        return (
          <motion.div key={m} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: i * 0.04 }}>
            <div className="flex items-baseline justify-between mb-1">
              <span
                className="text-[11px] font-medium capitalize px-2 py-0.5 rounded border"
                style={{
                  color: `var(--color-meal-${m})`,
                  background: `var(--color-meal-${m}-bg)`,
                  borderColor: `color-mix(in oklch, var(--color-meal-${m}), transparent 70%)`,
                }}
              >
                {m}
              </span>
              <span className="text-xs font-mono tabular-nums">
                {round(avg)} <span className="text-muted-foreground">avg</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-muted)" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${widthPct}%` }} transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }} style={{ background: `var(--color-meal-${m})`, height: "100%" }} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="py-16 text-center">
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-sm text-muted-foreground">
        Crunching numbers…
      </motion.div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <div className="text-base font-medium mb-1">Nothing logged this week.</div>
      <div className="text-sm text-muted-foreground">Use the arrows to look at a different week.</div>
    </div>
  );
}
