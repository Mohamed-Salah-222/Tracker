import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Dumbbell, Footprints, Flame, Check, RotateCcw, Trash2 } from "lucide-react";
import { AxiosError } from "axios";

// =====================================================================
// HARDCODED PROGRAM
// =====================================================================
type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string; // display string like "10-12" or "12"
};

const WORKOUT_A: Exercise[] = [
  { id: "lat-pulldown", name: "Lat Pulldown", sets: 4, reps: "10-12" },
  { id: "chest-press-machine", name: "Chest Press Machine", sets: 4, reps: "10-12" },
  { id: "seated-cable-row", name: "Seated Cable Row", sets: 3, reps: "12" },
  { id: "pec-deck", name: "Pec Deck (Chest Fly)", sets: 3, reps: "12" },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise", sets: 3, reps: "15" },
  { id: "tricep-pushdown", name: "Tricep Pushdown (Cable)", sets: 3, reps: "12" },
  { id: "bicep-curl-machine", name: "Bicep Curl Machine", sets: 3, reps: "12" },
];

const WORKOUT_B: Exercise[] = [
  { id: "leg-press", name: "Leg Press", sets: 4, reps: "10-12" },
  { id: "leg-curl", name: "Leg Curl (Lying or Seated)", sets: 3, reps: "12" },
  { id: "leg-extension", name: "Leg Extension", sets: 3, reps: "12" },
  { id: "seated-calf-raise", name: "Seated Calf Raise", sets: 3, reps: "15" },
  { id: "ab-crunch-machine", name: "Ab Crunch Machine", sets: 3, reps: "15" },
];

// ===== Types =====
type WorkoutType = "A" | "B" | "rest";

type Session = {
  _id: string;
  date: string;
  type: WorkoutType;
  warmupMinutes: number;
  warmupDone: boolean;
  finisherMinutes: number;
  finisherDone: boolean;
  walkMinutes: number;
  walkDistanceKm: number;
  completedAt: string | null;
  note: string;
};

type SetLog = {
  _id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  done: boolean;
};

type LastWeights = Record<string, { weight: number; reps: number | null; when: string }>;

// ===== Helpers =====
function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function workoutLabel(type: WorkoutType) {
  if (type === "A") return "Workout A · Upper";
  if (type === "B") return "Workout B · Lower";
  return "Rest day";
}

function getExercises(type: WorkoutType): Exercise[] {
  if (type === "A") return WORKOUT_A;
  if (type === "B") return WORKOUT_B;
  return [];
}

// ===== Motion =====
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

// =====================================================================
// MAIN
// =====================================================================
export default function Workout() {
  const [session, setSession] = useState<Session | null>(null);
  const [suggested, setSuggested] = useState<WorkoutType>("A");
  const [sets, setSets] = useState<SetLog[]>([]);
  const [lastWeights, setLastWeights] = useState<LastWeights>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  // ----- Loaders -----
  const loadToday = useCallback(async () => {
    try {
      const r = await api.get<{ session: Session | null; suggested: WorkoutType | null }>("/workouts/today");
      setSession(r.data.session);
      if (r.data.suggested) setSuggested(r.data.suggested);
      // If there's no session, prompt the picker
      if (!r.data.session) setPickerOpen(true);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadSets = useCallback(async (sessionId: string) => {
    try {
      const r = await api.get<SetLog[]>(`/workouts/session/${sessionId}/sets`);
      setSets(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadLastWeights = useCallback(async () => {
    try {
      const r = await api.get<LastWeights>("/workouts/last-weights");
      setLastWeights(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  useEffect(() => {
    void loadToday();
    void loadLastWeights();
  }, [loadToday, loadLastWeights]);

  useEffect(() => {
    if (session) void loadSets(session._id);
    else setSets([]);
  }, [session, loadSets]);

  // ----- Actions -----
  const startSession = async (type: WorkoutType) => {
    try {
      const r = await api.post<Session>("/workouts/session", { date: todayISO(), type });
      setSession(r.data);
      setPickerOpen(false);
      toast.success(`Started ${workoutLabel(type)}`);
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const patchSession = async (patch: Partial<Session>) => {
    if (!session) return;
    try {
      const r = await api.patch<Session>(`/workouts/session/${session._id}`, patch);
      setSession(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const completeSession = async () => {
    if (!session) return;
    await patchSession({ completedAt: new Date().toISOString() });
    toast.success("Workout complete");
    void loadLastWeights(); // refresh "last session" hints
  };

  const reopenSession = async () => {
    if (!session) return;
    await patchSession({ completedAt: null });
  };

  const deleteSession = async () => {
    if (!session) return;
    try {
      await api.delete(`/workouts/session/${session._id}`);
      setSession(null);
      setSets([]);
      void loadToday();
      toast.success("Session deleted");
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const changeType = async (type: WorkoutType) => {
    if (!session) return;
    await patchSession({ type });
    setSets([]);
    if (session) void loadSets(session._id);
  };

  // ----- Render -----
  const isCompleted = !!session?.completedAt;

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
            <Dumbbell className="h-4 w-4" />
            Workout
          </h1>
          {session && <WorkoutTypeBadge type={session.type} />}
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {session && (
            <>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Change
              </Button>
              {!isCompleted && (
                <Button variant="default" size="sm" onClick={completeSession}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Complete
                </Button>
              )}
              {isCompleted && (
                <Button variant="outline" size="sm" onClick={reopenSession}>
                  Reopen
                </Button>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* ===== Headline ===== */}
      <motion.div {...stagger(1)} className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</div>
          <div className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">{session ? workoutLabel(session.type) : "Not started"}</div>
          {isCompleted && (
            <div className="text-xs mt-1 font-medium" style={{ color: "var(--color-income)" }}>
              Completed {new Date(session!.completedAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>
        {session && session.type !== "rest" && <SessionProgress session={session} sets={sets} />}
      </motion.div>

      {/* ===== No session: empty state ===== */}
      {!session && (
        <motion.div {...stagger(2)}>
          <Card>
            <CardContent className="p-10 text-center">
              <Dumbbell className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
              <div className="text-sm font-medium mb-1">Pick today's workout.</div>
              <div className="text-sm text-muted-foreground mb-4">
                Suggested: <span className="font-medium">{workoutLabel(suggested)}</span>
              </div>
              <div className="flex justify-center gap-2 flex-wrap">
                <Button variant="default" size="default" onClick={() => startSession(suggested)}>
                  Start {workoutLabel(suggested)}
                </Button>
                <Button variant="outline" size="default" onClick={() => setPickerOpen(true)}>
                  Pick different
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ===== Rest day mode ===== */}
      {session && session.type === "rest" && <RestDayCard session={session} onChanged={patchSession} onDelete={deleteSession} />}

      {/* ===== Workout day (A or B) ===== */}
      {session && session.type !== "rest" && (
        <>
          {/* Warmup */}
          <CardioCard label="Warmup" icon={<Flame className="h-3.5 w-3.5" />} minutes={session.warmupMinutes} done={session.warmupDone} onMinutes={(n) => patchSession({ warmupMinutes: n })} onDone={(b) => patchSession({ warmupDone: b })} color="warmup" staggerIndex={2} />

          {/* Exercises */}
          {getExercises(session.type).map((ex, i) => (
            <ExerciseCard key={ex.id} exercise={ex} sessionId={session._id} existingSets={sets.filter((s) => s.exerciseId === ex.id)} lastSession={lastWeights[ex.id]} onChanged={() => loadSets(session._id)} index={i + 3} />
          ))}

          {/* Finisher */}
          <CardioCard label="Finisher" icon={<Footprints className="h-3.5 w-3.5" />} minutes={session.finisherMinutes} done={session.finisherDone} onMinutes={(n) => patchSession({ finisherMinutes: n })} onDone={(b) => patchSession({ finisherDone: b })} color="finisher" staggerIndex={getExercises(session.type).length + 3} />

          {/* Delete session option (low-key) */}
          {session && (
            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" onClick={deleteSession} className="text-xs text-muted-foreground">
                <Trash2 className="h-3 w-3 mr-1.5" />
                Delete this session
              </Button>
            </div>
          )}
        </>
      )}

      {/* ===== Picker dialog ===== */}
      <WorkoutPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        suggested={suggested}
        currentType={session?.type ?? null}
        onPick={(type) => {
          if (session) {
            void changeType(type);
            setPickerOpen(false);
          } else {
            void startSession(type);
          }
        }}
      />
    </div>
  );
}

// =====================================================================
// WorkoutTypeBadge
// =====================================================================
function WorkoutTypeBadge({ type }: { type: WorkoutType }) {
  const map = {
    A: { label: "Upper", color: "var(--color-workout-a)", bg: "var(--color-workout-a-bg)" },
    B: { label: "Lower", color: "var(--color-workout-b)", bg: "var(--color-workout-b-bg)" },
    rest: { label: "Rest", color: "var(--color-workout-rest)", bg: "var(--color-workout-rest-bg)" },
  };
  const v = map[type];
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded border font-medium"
      style={{
        color: v.color,
        background: v.bg,
        borderColor: `color-mix(in oklch, ${v.color}, transparent 70%)`,
      }}
    >
      {v.label}
    </span>
  );
}

// =====================================================================
// SessionProgress
// =====================================================================
function SessionProgress({ session, sets }: { session: Session; sets: SetLog[] }) {
  const exercises = getExercises(session.type);
  const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
  const doneSets = sets.filter((s) => s.done).length;
  const cardioPlanned = (session.warmupMinutes > 0 ? 1 : 0) + (session.finisherMinutes > 0 ? 1 : 0);
  const cardioDone = (session.warmupDone ? 1 : 0) + (session.finisherDone ? 1 : 0);

  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Progress</div>
      <div className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums">
        {doneSets}
        <span className="text-muted-foreground">/{totalSets}</span>
      </div>
      <div className="text-[10px] text-muted-foreground font-mono tabular-nums mt-0.5">
        cardio {cardioDone}/{cardioPlanned}
      </div>
    </div>
  );
}

// =====================================================================
// CardioCard (warmup / finisher)
// =====================================================================
function CardioCard({ label, icon, minutes, done, onMinutes, onDone, staggerIndex }: { label: string; icon: React.ReactNode; minutes: number; done: boolean; onMinutes: (n: number) => void; onDone: (b: boolean) => void; color: "warmup" | "finisher"; staggerIndex: number }) {
  const [localMin, setLocalMin] = useState(minutes.toString());

  useEffect(() => {
    setLocalMin(minutes.toString());
  }, [minutes]);

  const commit = () => {
    const n = parseFloat(localMin);
    if (!isNaN(n) && n >= 0 && n !== minutes) onMinutes(n);
  };

  return (
    <motion.div {...stagger(staggerIndex)}>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Checkbox checked={done} onCheckedChange={(v) => onDone(!!v)} />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-muted-foreground">{icon}</span>
              <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{label}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Input
                type="number"
                min="0"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="w-16 h-7 font-mono tabular-nums text-right"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// =====================================================================
// ExerciseCard
// =====================================================================
function ExerciseCard({ exercise, sessionId, existingSets, lastSession, onChanged, index }: { exercise: Exercise; sessionId: string; existingSets: SetLog[]; lastSession: LastWeights[string] | undefined; onChanged: () => void; index: number }) {
  // Local state for inputs to avoid lag
  const [local, setLocal] = useState<Record<number, { weight: string; reps: string }>>(() => {
    const m: Record<number, { weight: string; reps: string }> = {};
    for (let i = 1; i <= exercise.sets; i++) {
      const existing = existingSets.find((s) => s.setNumber === i);
      m[i] = {
        weight: existing?.weight != null ? existing.weight.toString() : "",
        reps: existing?.reps != null ? existing.reps.toString() : "",
      };
    }
    return m;
  });

  // Sync local with incoming sets (e.g. after refresh)
  useEffect(() => {
    setLocal((prev) => {
      const m = { ...prev };
      for (let i = 1; i <= exercise.sets; i++) {
        const existing = existingSets.find((s) => s.setNumber === i);
        m[i] = {
          weight: existing?.weight != null ? existing.weight.toString() : "",
          reps: existing?.reps != null ? existing.reps.toString() : "",
        };
      }
      return m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSets.length]);

  const upsertSet = async (setNumber: number, patch: { weight?: number | null; reps?: number | null; done?: boolean }) => {
    try {
      await api.put("/workouts/sets", { sessionId, exerciseId: exercise.id, setNumber, ...patch });
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const commitWeight = (setNumber: number) => {
    const v = local[setNumber]?.weight;
    const n = v === "" ? null : parseFloat(v);
    if (v !== "" && (n === null || isNaN(n) || n < 0)) return;
    void upsertSet(setNumber, { weight: n });
  };

  const commitReps = (setNumber: number) => {
    const v = local[setNumber]?.reps;
    const n = v === "" ? null : parseFloat(v);
    if (v !== "" && (n === null || isNaN(n) || n < 0)) return;
    void upsertSet(setNumber, { reps: n });
  };

  const toggleDone = (setNumber: number, currentDone: boolean) => {
    void upsertSet(setNumber, { done: !currentDone });
  };

  const setsArr = Array.from({ length: exercise.sets }, (_, i) => i + 1);
  const completed = existingSets.filter((s) => s.done).length;

  return (
    <motion.div {...stagger(index)}>
      <Card>
        <CardContent className="p-4 md:p-5">
          {/* Exercise header */}
          <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-baseline gap-2 min-w-0 flex-1">
              <span className="text-sm font-semibold truncate">{exercise.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">
                {exercise.sets} × {exercise.reps}
              </span>
            </div>
            <div className="text-xs font-mono tabular-nums flex-shrink-0" style={{ color: completed === exercise.sets ? "var(--color-income)" : "var(--color-muted-foreground)" }}>
              {completed}/{exercise.sets}
            </div>
          </div>

          {/* Last session hint */}
          {lastSession && (
            <div className="text-[11px] text-muted-foreground mb-3 font-mono tabular-nums flex items-center gap-1.5">
              <span className="text-muted-foreground/60">Last:</span>
              <span className="font-medium text-foreground">
                {lastSession.weight}kg{lastSession.reps != null ? ` × ${lastSession.reps}` : ""}
              </span>
            </div>
          )}

          {/* Sets */}
          <div className="space-y-1.5">
            {setsArr.map((setNumber) => {
              const existing = existingSets.find((s) => s.setNumber === setNumber);
              const isDone = existing?.done ?? false;
              const localVals = local[setNumber] ?? { weight: "", reps: "" };

              return (
                <motion.div key={setNumber} layout className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors ${isDone ? "opacity-70" : ""}`} style={isDone ? { background: "var(--color-muted)" } : {}}>
                  <Checkbox checked={isDone} onCheckedChange={() => toggleDone(setNumber, isDone)} />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium w-10 flex-shrink-0">Set {setNumber}</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      placeholder="kg"
                      value={localVals.weight}
                      onChange={(e) => setLocal((m) => ({ ...m, [setNumber]: { ...m[setNumber], weight: e.target.value } }))}
                      onBlur={() => commitWeight(setNumber)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-7 w-20 font-mono tabular-nums text-right"
                    />
                    <span className="text-xs text-muted-foreground">kg</span>
                    <span className="text-muted-foreground/40 px-1">×</span>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="reps"
                      value={localVals.reps}
                      onChange={(e) => setLocal((m) => ({ ...m, [setNumber]: { ...m[setNumber], reps: e.target.value } }))}
                      onBlur={() => commitReps(setNumber)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-7 w-16 font-mono tabular-nums text-right"
                    />
                    <span className="text-xs text-muted-foreground">reps</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// =====================================================================
// RestDayCard
// =====================================================================
function RestDayCard({ session, onChanged, onDelete }: { session: Session; onChanged: (patch: Partial<Session>) => void; onDelete: () => void }) {
  const [walkMin, setWalkMin] = useState(session.walkMinutes.toString());
  const [walkKm, setWalkKm] = useState(session.walkDistanceKm.toString());

  useEffect(() => {
    setWalkMin(session.walkMinutes.toString());
    setWalkKm(session.walkDistanceKm.toString());
  }, [session.walkMinutes, session.walkDistanceKm]);

  const commitMin = () => {
    const n = parseFloat(walkMin);
    if (!isNaN(n) && n >= 0) onChanged({ walkMinutes: n });
  };
  const commitKm = () => {
    const n = parseFloat(walkKm);
    if (!isNaN(n) && n >= 0) onChanged({ walkDistanceKm: n });
  };

  return (
    <>
      <motion.div {...stagger(2)}>
        <Card style={{ background: "var(--color-workout-rest-bg)" }}>
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-2 mb-2">
              <Footprints className="h-4 w-4" style={{ color: "var(--color-workout-rest)" }} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Rest day</span>
            </div>
            <div className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: "var(--color-workout-rest)" }}>
              Take it easy
            </div>
            <div className="text-sm text-muted-foreground mt-2">A 30-minute walk is optional but encouraged.</div>

            <div className="border-t border-border mt-5 pt-5 grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Walk duration</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    value={walkMin}
                    onChange={(e) => setWalkMin(e.target.value)}
                    onBlur={commitMin}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="font-mono tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Distance</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={walkKm}
                    onChange={(e) => setWalkKm(e.target.value)}
                    onBlur={commitKm}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="font-mono tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">km</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-xs text-muted-foreground">
          <Trash2 className="h-3 w-3 mr-1.5" />
          Delete this session
        </Button>
      </div>
    </>
  );
}

// =====================================================================
// WorkoutPickerDialog
// =====================================================================
function WorkoutPickerDialog({ open, onOpenChange, suggested, currentType, onPick }: { open: boolean; onOpenChange: (b: boolean) => void; suggested: WorkoutType; currentType: WorkoutType | null; onPick: (type: WorkoutType) => void }) {
  const options: { type: WorkoutType; label: string; desc: string }[] = [
    { type: "A", label: "Workout A", desc: "Upper body" },
    { type: "B", label: "Workout B", desc: "Lower body" },
    { type: "rest", label: "Rest day", desc: "Optional walk" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentType ? "Change workout" : "Pick today's workout"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {options.map((opt) => {
            const isSuggested = opt.type === suggested && !currentType;
            const isCurrent = opt.type === currentType;
            return (
              <button key={opt.type} type="button" onClick={() => onPick(opt.type)} disabled={isCurrent} className="w-full text-left rounded-md border border-border p-3 hover:border-border-strong hover:bg-muted/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <WorkoutTypeBadge type={opt.type} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </div>
                {isSuggested && (
                  <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--color-income)" }}>
                    Suggested
                  </span>
                )}
                {isCurrent && <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Current</span>}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
