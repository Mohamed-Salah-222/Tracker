import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Card, CardContent } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { TrendingUp, Trophy, BarChart3, Dumbbell, Flame, Calendar } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { AxiosError } from "axios";
import { toast } from "sonner";

// Mirror the program from Workout.tsx
const WORKOUT_A_EXERCISES = [
  { id: "lat-pulldown", name: "Lat Pulldown" },
  { id: "chest-press-machine", name: "Chest Press Machine" },
  { id: "seated-cable-row", name: "Seated Cable Row" },
  { id: "pec-deck", name: "Pec Deck (Chest Fly)" },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise" },
  { id: "tricep-pushdown", name: "Tricep Pushdown (Cable)" },
  { id: "bicep-curl-machine", name: "Bicep Curl Machine" },
];
const WORKOUT_B_EXERCISES = [
  { id: "leg-press", name: "Leg Press" },
  { id: "leg-curl", name: "Leg Curl (Lying or Seated)" },
  { id: "leg-extension", name: "Leg Extension" },
  { id: "seated-calf-raise", name: "Seated Calf Raise" },
  { id: "ab-crunch-machine", name: "Ab Crunch Machine" },
];
const ALL_EXERCISES = [...WORKOUT_A_EXERCISES, ...WORKOUT_B_EXERCISES];
const EXERCISE_NAME_BY_ID: Record<string, string> = Object.fromEntries(ALL_EXERCISES.map((e) => [e.id, e.name]));

// ===== Types =====
type WorkoutType = "A" | "B" | "rest";

type StatsResp = {
  from: string;
  to: string;
  totalSessions: number;
  completedSessions: number;
  sessionsByType: { A: number; B: number; rest: number };
  totalVolume: number;
  totalSetsDone: number;
  totalReps: number;
  days: { date: string; type: WorkoutType; volume: number; setsDone: number; completed: boolean }[];
  bestByExercise: Record<string, { weight: number; reps: number; date: string }>;
};

type ProgressResp = {
  exerciseId: string;
  history: { weight: number | null; reps: number | null; date: string; setNumber: number; sessionId: string }[];
};

const round = (n: number) => Math.round(n);

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

const dayShort = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLong = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

// =====================================================================
// MAIN
// =====================================================================
export function WorkoutRecapModal({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickedExercise, setPickedExercise] = useState<string>("lat-pulldown");
  const [progress, setProgress] = useState<ProgressResp | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  // ----- Load stats when opened -----
  const loadStats = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const r = await api.get<StatsResp>("/workouts/stats");
      setStats(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [open]);

  // ----- Load exercise progress when picked -----
  const loadProgress = useCallback(async () => {
    if (!open || !pickedExercise) return;
    setProgressLoading(true);
    try {
      const r = await api.get<ProgressResp>("/workouts/exercise-progress", {
        params: { exerciseId: pickedExercise, limit: 12 },
      });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[860px] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Workout history</DialogTitle>

        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Workout history</div>
              <div className="text-base font-semibold tracking-tight mt-0.5">Last 30 days · {rangeLabel}</div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <AnimatePresence mode="wait">
            {loading && !stats ? (
              <LoadingState />
            ) : noData ? (
              <EmptyState />
            ) : (
              <motion.div key="content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-5">
                {/* ===== Top stats ===== */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Sessions" value={`${stats!.completedSessions}/${stats!.totalSessions}`} sub="completed" icon={<Calendar className="h-3 w-3" />} />
                  <StatCard label="Total volume" value={`${stats!.totalVolume.toLocaleString("en-US")}`} sub="kg × reps" icon={<Dumbbell className="h-3 w-3" />} />
                  <StatCard label="Sets done" value={`${stats!.totalSetsDone}`} sub={`${stats!.totalReps.toLocaleString("en-US")} reps`} icon={<TrendingUp className="h-3 w-3" />} />
                  <StatCard label="Split" value={`${stats!.sessionsByType.A}A · ${stats!.sessionsByType.B}B`} sub={`${stats!.sessionsByType.rest} rest`} icon={<Flame className="h-3 w-3" />} />
                </div>

                {/* ===== Daily volume chart ===== */}
                <Card>
                  <CardContent className="p-5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                      <BarChart3 className="h-3 w-3" />
                      Volume by session
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats!.days} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={dayShort} stroke="var(--color-border)" />
                          <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={48} />
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
                              const payload = (p as { payload?: { type?: string; setsDone?: number } }).payload;
                              const type = payload?.type ?? "";
                              const setsDone = payload?.setsDone ?? 0;
                              const t = type === "A" ? "Upper" : type === "B" ? "Lower" : "Rest";
                              return [`${Number(v).toLocaleString()} · ${setsDone} sets · ${t}`, "Volume"];
                            }}
                          />
                          <Bar dataKey="volume" radius={[4, 4, 0, 0]} animationDuration={500}>
                            {stats!.days.map((d, i) => {
                              const color = d.type === "A" ? "var(--color-workout-a)" : d.type === "B" ? "var(--color-workout-b)" : "var(--color-workout-rest)";
                              return <Cell key={i} fill={color} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-workout-a)" }} />
                        Upper (A)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "var(--color-workout-b)" }} />
                        Lower (B)
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
                  <CardContent className="p-5">
                    <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3" />
                        Exercise progression
                      </div>
                      <Select value={pickedExercise} onValueChange={(v) => setPickedExercise(v ?? "lat-pulldown")}>
                        <SelectTrigger className="!h-7 w-[220px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lat-pulldown" disabled className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                            Upper (A)
                          </SelectItem>
                          {WORKOUT_A_EXERCISES.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="leg-press" disabled className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                            Lower (B)
                          </SelectItem>
                          {WORKOUT_B_EXERCISES.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {progressLoading && !progress ? (
                      <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
                    ) : !progress || progress.history.length === 0 ? (
                      <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">No logged data for {EXERCISE_NAME_BY_ID[pickedExercise] ?? pickedExercise} yet.</div>
                    ) : (
                      <ExerciseProgressChart history={progress.history} />
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
                                    <span className="font-semibold text-foreground">{h.weight ?? "—"}</span>
                                    <span className="text-muted-foreground"> kg × </span>
                                    <span className="font-semibold text-foreground">{h.reps ?? "—"}</span>
                                  </span>
                                  {delta !== null && delta !== 0 && (
                                    <span className="text-[10px] font-mono tabular-nums font-medium" style={{ color: delta > 0 ? "var(--color-income)" : "var(--color-expense)" }}>
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
                    <CardContent className="p-5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                        <Trophy className="h-3 w-3" />
                        Best lifts (this period)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {ALL_EXERCISES.filter((e) => stats!.bestByExercise[e.id]).map((ex) => {
                          const best = stats!.bestByExercise[ex.id];
                          return (
                            <div key={ex.id} className="flex items-center justify-between text-sm border-b border-border py-2">
                              <span className="truncate">{ex.name}</span>
                              <div className="font-mono tabular-nums flex items-baseline gap-1.5 flex-shrink-0 ml-2">
                                <span className="text-sm font-semibold">{best.weight}</span>
                                <span className="text-xs text-muted-foreground">kg ×</span>
                                <span className="text-sm font-semibold">{best.reps}</span>
                                <span className="text-[10px] text-muted-foreground ml-1">· {dayShort(best.date)}</span>
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
                  <CardContent className="p-5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Session split</div>
                    <SplitDonut counts={stats!.sessionsByType} />
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

function ExerciseProgressChart({ history }: { history: ProgressResp["history"] }) {
  const data = history.map((h) => ({
    date: h.date,
    weight: h.weight ?? 0,
    reps: h.reps ?? 0,
  }));

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={dayShort} stroke="var(--color-border)" />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={36} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={28} />
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(label) => dayLong(label as string)}
            formatter={(v, name) => {
              if (name === "weight") return [`${Number(v)} kg`, "Weight"];
              return [`${Number(v)} reps`, "Reps"];
            }}
          />
          <Line yAxisId="left" type="monotone" dataKey="weight" stroke="var(--color-workout-a)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={500} />
          <Line yAxisId="right" type="monotone" dataKey="reps" stroke="var(--color-workout-b)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-[2px]" style={{ background: "var(--color-workout-a)" }} />
          Weight (kg)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-[2px] border-t border-dashed" style={{ borderColor: "var(--color-workout-b)" }} />
          Reps
        </span>
      </div>
    </div>
  );
}

function SplitDonut({ counts }: { counts: { A: number; B: number; rest: number } }) {
  const total = counts.A + counts.B + counts.rest;
  if (total === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">No data</div>;
  }
  const data = [
    { name: "Upper (A)", value: counts.A, color: "var(--color-workout-a)" },
    { name: "Lower (B)", value: counts.B, color: "var(--color-workout-b)" },
    { name: "Rest", value: counts.rest, color: "var(--color-workout-rest)" },
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
            formatter={(v, name) => [`${Number(v)} (${round((Number(v) / total) * 100)}%)`, String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Sessions</div>
          <div className="text-sm font-semibold font-mono tabular-nums">{total}</div>
        </div>
      </div>
      <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-3 text-[10px]">
        <span className="flex items-center gap-1" style={{ color: "var(--color-workout-a)" }}>
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: "var(--color-workout-a)" }} />
          {counts.A} upper
        </span>
        <span className="flex items-center gap-1" style={{ color: "var(--color-workout-b)" }}>
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: "var(--color-workout-b)" }} />
          {counts.B} lower
        </span>
        <span className="flex items-center gap-1" style={{ color: "var(--color-workout-rest)" }}>
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: "var(--color-workout-rest)" }} />
          {counts.rest} rest
        </span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="py-16 text-center">
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-sm text-muted-foreground">
        Loading workout history…
      </motion.div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <Dumbbell className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
      <div className="text-base font-medium mb-1">No workout data yet.</div>
      <div className="text-sm text-muted-foreground">Log a few sessions with weight × reps and come back here.</div>
    </div>
  );
}
