import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { TrendingUp, Trophy, BarChart3, Dumbbell, Flame, Calendar, StickyNote } from "lucide-react";
import { BarSeries, LineSeries } from "./MiniChart";
import { api } from "../lib/api";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { workoutLabel, type WorkoutType } from "../lib/workoutProgram";
import { ALL_MOVEMENT_IDS, isRestDay, movementName } from "../lib/workoutSplits";

/** Every movement any split can use, alphabetical, for the progression picker. */
const PICKABLE = [...ALL_MOVEMENT_IDS].map((id) => ({ id, name: movementName(id) })).sort((a, b) => a.name.localeCompare(b.name));

// ===== Types =====

type StatsResp = {
  from: string;
  to: string;
  totalSessions: number;
  completedSessions: number;
  trainingSessions: number;
  completedTrainingSessions: number;
  sessionsByType: { upper: number; lower: number; rest: number };
  totalWeightLogged: number;
  totalSetsDone: number;
  days: { date: string; type: WorkoutType; volume: number; setsDone: number; completed: boolean; note: string }[];
  bestByExercise: Record<string, { weight: number; reps: number; date: string }>;
};

type ProgressResp = {
  exerciseId: string;
  history: { weight: number | null; reps: number | null; date: string; setNumber: number; sessionId: string }[];
};

const round = (n: number) => Math.round(n);

/** 12,480 kg is noise on a stat tile; 12.5k reads at a glance. */
function compactKg(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

const dayShort = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLong = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** Rest days sit at the pale end of the grey ladder; training days are solid. */
function workoutColor(type: WorkoutType) {
  return isRestDay(type) ? "var(--color-workout-rest)" : "var(--color-workout-upper)";
}

// ===== Range =====
type Range = "week" | "month";

const RANGE_DAYS: Record<Range, number> = { week: 7, month: 30 };
const RANGE_LABEL: Record<Range, string> = { week: "This week", month: "Last 30 days" };

/** Inclusive `from`, exclusive `to`, both as plain YYYY-MM-DD days. */
function rangeParams(range: Range): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  to.setUTCDate(to.getUTCDate() + 1); // exclusive upper bound = end of today
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - RANGE_DAYS[range]);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// =====================================================================
// MAIN
// =====================================================================
export function WorkoutRecapModal({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<Range>("week");
  // Left empty until the stats arrive; picking alphabetically would open the chart
  // on a movement that has never been logged, which is what it used to do.
  const [pickedExercise, setPickedExercise] = useState<string>("");
  const [progress, setProgress] = useState<ProgressResp | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const progressCache = useRef<Record<string, ProgressResp>>({});

  // ----- Load stats when opened -----
  // Toggling week/month used to refetch every time. Serving the previous answer
  // instantly and revalidating behind it makes the switch feel immediate.
  const statsCache = useRef<Partial<Record<Range, StatsResp>>>({});

  const loadStats = useCallback(async () => {
    if (!open) return;
    const cached = statsCache.current[range];
    if (cached) setStats(cached);
    setLoading(true);
    try {
      const r = await api.get<StatsResp>("/workouts/stats", { params: rangeParams(range) });
      statsCache.current[range] = r.data;
      setStats(r.data);
      // Land on something with data. Only falls back to the full list when nothing
      // at all has been logged yet.
      setPickedExercise((current) => {
        if (current && r.data.bestByExercise[current]) return current;
        const logged = PICKABLE.find((e) => r.data.bestByExercise[e.id]);
        return logged?.id ?? current ?? PICKABLE[0].id;
      });
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [open, range]);

  // ----- Load exercise progress when picked -----
  const loadProgress = useCallback(async () => {
    if (!open || !pickedExercise) return;
    const cached = progressCache.current[pickedExercise];
    if (cached) setProgress(cached);
    setProgressLoading(true);
    try {
      const r = await api.get<ProgressResp>("/workouts/exercise-progress", {
        params: { exerciseId: pickedExercise, limit: 12 },
      });
      progressCache.current[pickedExercise] = r.data;
      setProgress(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setProgressLoading(false);
    }
  }, [open, pickedExercise]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);
  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  // ----- Computed -----
  const rangeLabel = useMemo(() => {
    if (!stats) return "";
    return `${dayShort(stats.from)} – ${dayShort(stats.to)}`;
  }, [stats]);

  const noData = !stats || stats.totalSessions === 0;

  const loggedFirst = useMemo(() => {
    const best = stats?.bestByExercise ?? {};
    return { logged: PICKABLE.filter((e) => best[e.id]), rest: PICKABLE.filter((e) => !best[e.id]) };
  }, [stats]);

  const trainingSessions = stats ? stats.sessionsByType.upper + stats.sessionsByType.lower : 0;
  const avgVolume = trainingSessions > 0 ? Math.round(stats!.totalWeightLogged / trainingSessions) : 0;

  // Rest days are real sessions but carry no volume, so charting them adds a run of
  // empty columns that squeezes the days that actually have data.
  const volumeBars = useMemo(
    () =>
      (stats ? stats.days.filter((d) => d.type !== "rest") : []).map((d) => ({
        key: d.date,
        label: dayShort(d.date),
        value: d.volume,
        color: workoutColor(d.type),
        tooltip: [dayLong(d.date), `${Math.round(d.volume).toLocaleString("en-US")} kg · ${d.setsDone} sets`, workoutLabel(d.type)],
      })),
    [stats],
  );

  const progressPoints = useMemo(() => {
    if (!progress) return [];
    return progress.history
      .filter((h) => h.weight != null)
      .map((h, i) => ({
        key: `${h.sessionId}-${h.setNumber}-${i}`,
        label: dayShort(h.date),
        value: h.weight as number,
        tooltip: [dayLong(h.date), `${h.weight} kg${h.reps ? ` × ${h.reps}` : ""}`, `Set ${h.setNumber}`],
      }));
  }, [progress]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[860px] !w-[calc(100vw-1rem)] sm:!w-[calc(100vw-3rem)] max-h-[92svh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Workout history</DialogTitle>

        {/* Header */}
        {/* Solid, not blurred: a backdrop-filter on a sticky element repaints the
            layer on every scroll frame, which made the modal judder while scrolling. */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Workout history</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-base font-semibold tracking-tight">
                  {RANGE_LABEL[range]} · {rangeLabel}
                </span>
                {loading && stats && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted border-t-muted-foreground" aria-label="Refreshing" />}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
              {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${range === r ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-3 py-4 space-y-4 sm:px-6 sm:py-5 sm:space-y-5">
          <AnimatePresence>
            {loading && !stats ? (
              <LoadingState />
            ) : noData ? (
              <EmptyState range={range} />
            ) : (
              <motion.div key="content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-5">
                {/* ===== Top stats ===== */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
                  <StatCard label="Training" value={`${stats!.completedTrainingSessions}/${stats!.trainingSessions}`} sub={stats!.sessionsByType.rest > 0 ? `finished · ${stats!.sessionsByType.rest} rest` : "sessions finished"} icon={<Calendar className="h-3 w-3" />} />
                  <StatCard label="Volume" value={compactKg(stats!.totalWeightLogged)} sub="kg lifted" icon={<Dumbbell className="h-3 w-3" />} />
                  <StatCard label="Sets done" value={`${stats!.totalSetsDone}`} sub={`${trainingSessions} training days`} icon={<TrendingUp className="h-3 w-3" />} />
                  <StatCard label="Avg / session" value={compactKg(avgVolume)} sub="kg per session" icon={<Flame className="h-3 w-3" />} />
                </div>

                {/* ===== Daily volume chart ===== */}
                <Card>
                  <CardContent className="p-3 sm:p-5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                      <BarChart3 className="h-3 w-3" />
                      Volume by session
                    </div>
                    <BarSeries points={volumeBars} height={208} emptyLabel="No training sessions in this period." />
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-workout-upper)" }} />
                        Upper
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-workout-lower)" }} />
                        Lower
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-workout-rest)" }} />
                        Rest
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* ===== Per-exercise progress ===== */}
                <Card>
                  <CardContent className="p-3 sm:p-5">
                    <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3" />
                        Exercise progression
                      </div>
                      <Select value={pickedExercise} onValueChange={(v) => setPickedExercise(v ?? pickedExercise)}>
                        <SelectTrigger className="!h-9 w-full text-xs sm:w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        {/* Movements you have actually lifted come first; the rest are
                            still reachable but pushed below a divider. */}
                        <SelectContent>
                          {loggedFirst.logged.length > 0 && (
                            <SelectItem value="section-logged" disabled className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                              Logged
                            </SelectItem>
                          )}
                          {loggedFirst.logged.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                          {loggedFirst.rest.length > 0 && (
                            <SelectItem value="section-rest" disabled className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                              Not logged yet
                            </SelectItem>
                          )}
                          {loggedFirst.rest.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {progressLoading && !progress ? (
                      <Skeleton className="h-44 w-full rounded-lg" />
                    ) : (
                      <LineSeries points={progressPoints} height={176} emptyLabel={`No logged data for ${movementName(pickedExercise)} yet.`} />
                    )}

                    {/* Compact history table */}
                    {progress && progress.history.length > 0 && (
                      <div className="mt-4 border-t border-border pt-4">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Recent sessions</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {[...progress.history].reverse().map((h, i) => {
                            const prev = i < progress.history.length - 1 ? progress.history[progress.history.length - 1 - i - 1] : null;
                            const delta = prev && h.weight != null && prev.weight != null ? h.weight - prev.weight : null;
                            return (
                              <div key={`${h.sessionId}-${i}`} className="flex items-center justify-between text-xs border-b border-border py-1.5">
                                <span className="text-muted-foreground font-mono tabular-nums">{dayShort(h.date)}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono tabular-nums">
                                    <span className="font-semibold text-foreground">{h.weight ?? "-"}</span>
                                    <span className="text-muted-foreground"> kg</span>
                                  </span>
                                  {delta !== null && delta !== 0 && (
                                    <span className={`text-[10px] font-mono tabular-nums font-medium ${delta > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                                      {delta > 0 ? "+" : ""}
                                      {delta}kg
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ===== Best lifts ===== */}
                {Object.keys(stats!.bestByExercise).length > 0 && (
                  <Card>
                    <CardContent className="p-3 sm:p-5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                        <Trophy className="h-3 w-3" />
                        Heaviest set per exercise
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {PICKABLE.filter((e) => stats!.bestByExercise[e.id]).map((ex) => {
                          const best = stats!.bestByExercise[ex.id];
                          return (
                            <div key={ex.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-b-0 md:last:border-b md:[&:nth-last-child(-n+2)]:border-b-0">
                              <span className="min-w-0 truncate">{ex.name}</span>
                              <div className="flex flex-shrink-0 items-baseline gap-1 font-mono tabular-nums">
                                <span className="text-sm font-semibold">{best.weight}</span>
                                <span className="text-xs text-muted-foreground">kg</span>
                                {best.reps > 0 && <span className="text-xs text-muted-foreground">× {best.reps}</span>}
                                <span className="ml-1.5 text-[10px] text-muted-foreground/80">{dayShort(best.date)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ===== Split distribution ===== */}
                <Card>
                  <CardContent className="p-3 sm:p-5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Session split</div>
                    <SplitBar counts={stats!.sessionsByType} />
                  </CardContent>
                </Card>

                {/* ===== Session notes ===== */}
                <SessionNotes days={stats!.days} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Subcomponents
// =====================================================================

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div className="text-lg font-semibold font-mono tabular-nums mt-1 truncate">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground font-mono tabular-nums">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SplitBar({ counts }: { counts: { upper: number; lower: number; rest: number } }) {
  const total = counts.upper + counts.lower + counts.rest;
  if (total === 0) {
    return <div className="py-6 text-center text-xs text-muted-foreground">No sessions in this period.</div>;
  }

  const parts = [
    { key: "upper", label: "Upper", value: counts.upper, color: "var(--color-workout-upper)" },
    { key: "lower", label: "Lower", value: counts.lower, color: "var(--color-workout-lower)" },
    { key: "rest", label: "Rest", value: counts.rest, color: "var(--color-workout-rest)" },
  ].filter((p) => p.value > 0);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((p) => `${p.value} ${p.label}`).join(", ")}>
        {parts.map((p) => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="font-medium">{p.label}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {p.value} · {round((p.value / total) * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Mirrors the real layout so the content does not jump when it lands. */
function LoadingState() {
  return (
    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 sm:space-y-5" aria-busy="true" aria-label="Loading workout history">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-28 rounded-xl" />
    </motion.div>
  );
}

function EmptyState({ range }: { range: Range }) {
  return (
    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-16 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Dumbbell className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mb-1 text-base font-semibold">Nothing logged {range === "week" ? "this week" : "in the last 30 days"}</div>
      <div className="text-sm text-muted-foreground">{range === "week" ? "Try the Month view, or finish a session to see it here." : "Finish a session with weight and reps to see it here."}</div>
    </motion.div>
  );
}

// =====================================================================
// Session notes: the only place the per-day notes are readable back
// =====================================================================
function SessionNotes({ days }: { days: StatsResp["days"] }) {
  const withNotes = useMemo(() => days.filter((d) => d.note.trim().length > 0).sort((a, b) => b.date.localeCompare(a.date)), [days]);

  return (
    <Card>
      <CardContent className="p-3 sm:p-5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
          <StickyNote className="h-3 w-3" />
          Notes
        </div>

        {withNotes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No notes in this period. Anything you type in the Notes box on a workout day shows up here.
          </p>
        ) : (
          <div className="space-y-3">
            {withNotes.map((d) => (
              <div key={d.date} className="border-l-2 border-border pl-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium">{dayLong(d.date)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{workoutLabel(d.type)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{d.note}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
