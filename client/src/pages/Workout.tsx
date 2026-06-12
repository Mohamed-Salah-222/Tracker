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
import { Dumbbell, Footprints, Check, RotateCcw, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { BarChart3 } from "lucide-react";
import { WorkoutRecapModal } from "../components/WorkoutRecapModal";
import { AxiosError } from "axios";

// =====================================================================
// HARDCODED PROGRAM
// =====================================================================
type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
};

type SectionKind = "warmup" | "training" | "abs";

type WorkoutDef = Record<SectionKind, Exercise[]>;

const WARMUP_UPPER_A_AND_LOWER_B_HEAD: Exercise[] = [
  { id: "treadmill-15", name: "15 min Treadmill", sets: 1, reps: "-" },
];

const WARMUP_UA: Exercise[] = [
  ...WARMUP_UPPER_A_AND_LOWER_B_HEAD,
  { id: "arm-swing-front", name: "Arm Swing Front", sets: 3, reps: "15" },
  { id: "arm-cycle", name: "Arm Cycle", sets: 3, reps: "15" },
  { id: "arm-sides", name: "Arm Sides", sets: 3, reps: "15" },
  { id: "knee-swing", name: "Knee Swing", sets: 3, reps: "15" },
  { id: "warmup-squats", name: "Squats", sets: 3, reps: "15" },
];

const WARMUP_LA_AND_UB: Exercise[] = [
  { id: "treadmill-15", name: "15 min Treadmill", sets: 1, reps: "-" },
  { id: "arm-swing-front", name: "Arm Swing Front", sets: 3, reps: "15" },
  { id: "arm-cycle", name: "Arm Cycle", sets: 3, reps: "15" },
  { id: "waist-twist", name: "Waist Twist", sets: 3, reps: "15" },
  { id: "knee-swing", name: "Knee Swing", sets: 3, reps: "15" },
  { id: "leg-swing", name: "Leg Swing", sets: 3, reps: "15" },
];

const WARMUP_LB: Exercise[] = [
  { id: "treadmill-15", name: "15 min Treadmill", sets: 1, reps: "-" },
  { id: "knee-raises-warmup", name: "Knee Raises", sets: 3, reps: "15" },
  { id: "leg-raises-warmup", name: "Leg Raises", sets: 3, reps: "15" },
  { id: "warmup-squats", name: "Squats", sets: 3, reps: "15" },
  { id: "warmup-jumps", name: "Jumps", sets: 3, reps: "15" },
];

const TRAINING_UPPER_A: Exercise[] = [
  { id: "chest-press-machine", name: "Chest Press Machine", sets: 3, reps: "12" },
  { id: "chest-fly-machine", name: "Chest Fly Machine", sets: 3, reps: "12" },
  { id: "shoulder-press-machine", name: "Shoulder Press Machine", sets: 3, reps: "12" },
  { id: "lateral-raises", name: "Lateral Raises", sets: 3, reps: "12" },
  { id: "hammer-strength-close", name: "Hammer Strength Close Grip", sets: 3, reps: "12" },
  { id: "hammer-strength-wide", name: "Hammer Strength Wide Grip", sets: 3, reps: "12" },
  { id: "high-pulley-curl", name: "High Pulley Curl", sets: 3, reps: "12" },
  { id: "skull-crushers", name: "Skull Crushers", sets: 3, reps: "12" },
];

const TRAINING_LOWER: Exercise[] = [
  { id: "leg-press", name: "Leg Press", sets: 3, reps: "12" },
  { id: "hack-squats", name: "Hack Squats", sets: 3, reps: "10" },
  { id: "leg-extension", name: "Leg Extension", sets: 3, reps: "12" },
  { id: "romanian-deadlift", name: "Romanian Deadlift", sets: 3, reps: "12" },
  { id: "calf-raise-hack", name: "Calf Raise on Hack", sets: 3, reps: "15" },
];

const TRAINING_UPPER_B: Exercise[] = [
  { id: "bar-bench-press", name: "Bar Bench Press", sets: 3, reps: "10" },
  { id: "low-cable-crossover", name: "Low Cable Crossover", sets: 3, reps: "12" },
  { id: "dumbbell-lateral-raise", name: "Dumbbell Lateral Raise", sets: 3, reps: "12" },
  { id: "cable-raise", name: "Cable Raise", sets: 3, reps: "12" },
  { id: "bar-machine", name: "Bar Machine", sets: 3, reps: "12" },
  { id: "pull-over", name: "Pull Over", sets: 3, reps: "12" },
  { id: "barbell-bicep-curl", name: "Barbell Bicep Curl", sets: 3, reps: "12" },
  { id: "rope-overhead", name: "Rope Overhead", sets: 3, reps: "12" },
];

const ABS_UPPER_A: Exercise[] = [
  { id: "planks", name: "Planks", sets: 2, reps: "30s" },
  { id: "crunches", name: "Crunches", sets: 2, reps: "15" },
  { id: "leg-raises-abs", name: "Leg Raises", sets: 2, reps: "15" },
];

const ABS_LOWER_A: Exercise[] = [
  { id: "planks", name: "Planks", sets: 2, reps: "30s" },
  { id: "russian-twist", name: "Russian Twist", sets: 2, reps: "15" },
  { id: "leg-raises-abs", name: "Leg Raises", sets: 2, reps: "15" },
];

const ABS_UPPER_B: Exercise[] = [
  { id: "high-cable-side-bend", name: "High Cable Side Bend", sets: 2, reps: "15" },
  { id: "high-rope-crunches", name: "High Rope Crunches", sets: 2, reps: "15" },
  { id: "rope-crunches", name: "Rope Crunches", sets: 2, reps: "15" },
];

const ABS_LOWER_B: Exercise[] = [
  { id: "side-planks", name: "Side Planks", sets: 2, reps: "15" },
  { id: "crunches", name: "Crunches", sets: 2, reps: "15" },
  { id: "sit-ups", name: "Sit Ups", sets: 2, reps: "15" },
];

// ===== Types =====
type WorkoutType = "upperA" | "lowerA" | "upperB" | "lowerB" | "rest";

const PROGRAM: Record<Exclude<WorkoutType, "rest">, WorkoutDef> = {
  upperA: { warmup: WARMUP_UA, training: TRAINING_UPPER_A, abs: ABS_UPPER_A },
  lowerA: { warmup: WARMUP_LA_AND_UB, training: TRAINING_LOWER, abs: ABS_LOWER_A },
  upperB: { warmup: WARMUP_LA_AND_UB, training: TRAINING_UPPER_B, abs: ABS_UPPER_B },
  lowerB: { warmup: WARMUP_LB, training: TRAINING_LOWER, abs: ABS_LOWER_B },
};

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

function shiftDay(iso: string, by: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function workoutLabel(type: WorkoutType) {
  if (type === "upperA") return "Upper A";
  if (type === "lowerA") return "Lower A";
  if (type === "upperB") return "Upper B";
  if (type === "lowerB") return "Lower B";
  return "Rest day";
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
  const [suggested, setSuggested] = useState<WorkoutType>("upperA");
  const [sets, setSets] = useState<SetLog[]>([]);
  const [lastWeights, setLastWeights] = useState<LastWeights>({});
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);

  // ----- Loaders -----
  const loadSession = useCallback(async () => {
    const today = todayISO();
    try {
      if (selectedDate === today) {
        const r = await api.get<{ session: Session | null; suggested: WorkoutType | null }>("/workouts/today");
        setSession(r.data.session);
        if (r.data.suggested) setSuggested(r.data.suggested);
        if (!r.data.session) setPickerOpen(true);
      } else {
        const r = await api.get<Session | null>(`/workouts/session?date=${selectedDate}`);
        setSession(r.data);
        if (!r.data) setPickerOpen(true);
      }
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [selectedDate]);

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
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadLastWeights();
  }, [loadLastWeights]);

  useEffect(() => {
    if (session) void loadSets(session._id);
    else setSets([]);
  }, [session, loadSets]);

  // ----- Actions -----
  const startSession = async (type: WorkoutType) => {
    try {
      const r = await api.post<Session>("/workouts/session", { date: selectedDate, type });
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
      void loadSession();
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
  const activeDef = session && session.type !== "rest" ? PROGRAM[session.type] : null;

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
          <Button variant="outline" size="sm" onClick={() => setRecapOpen(true)}>
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            History
          </Button>
        </div>
      </motion.div>

      {/* ===== Date navigation ===== */}
      <motion.div {...stagger(0)} className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-1 items-center justify-center gap-2">
          <span className="text-sm font-medium">
            {new Date(selectedDate + "T00:00:00Z").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
          {selectedDate === todayISO() && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</span>
          )}
        </div>
        <Button variant="ghost" size="sm" disabled={selectedDate === todayISO()} onClick={() => setSelectedDate(todayISO())}>
          Today
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </motion.div>

      {/* ===== Headline ===== */}
      <motion.div {...stagger(1)} className="flex items-end justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {selectedDate === todayISO() ? "Today" : "Session"}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">{session ? workoutLabel(session.type) : "Not started"}</div>
            {session && (
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Change
                </Button>
                {!isCompleted ? (
                  <Button variant="default" size="sm" onClick={completeSession}>
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Complete
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={reopenSession}>
                    Reopen
                  </Button>
                )}
              </div>
            )}
          </div>
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

      {/* ===== Workout day ===== */}
      {session && activeDef && (
        <>
          <SectionHeader title="Warmup" index={2} />
          {activeDef.warmup.map((ex, i) => (
            <ChecklistRow
              key={ex.id}
              exercise={ex}
              existingSets={sets.filter((s) => s.exerciseId === ex.id)}
              sessionId={session._id}
              onChanged={() => loadSets(session._id)}
              index={i + 3}
            />
          ))}

          <SectionHeader title="Training" index={activeDef.warmup.length + 3} />
          {activeDef.training.map((ex, i) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              sessionId={session._id}
              existingSets={sets.filter((s) => s.exerciseId === ex.id)}
              lastSession={lastWeights[ex.id]}
              onChanged={() => loadSets(session._id)}
              index={i + activeDef.warmup.length + 4}
            />
          ))}

          <SectionHeader title="Abs" index={activeDef.warmup.length + activeDef.training.length + 4} />
          {activeDef.abs.map((ex, i) => (
            <ChecklistRow
              key={ex.id}
              exercise={ex}
              existingSets={sets.filter((s) => s.exerciseId === ex.id)}
              sessionId={session._id}
              onChanged={() => loadSets(session._id)}
              index={i + activeDef.warmup.length + activeDef.training.length + 5}
            />
          ))}

          <div className="flex justify-center pt-2">
            <Button variant="ghost" size="sm" onClick={deleteSession} className="text-xs text-muted-foreground">
              <Trash2 className="h-3 w-3 mr-1.5" />
              Delete this session
            </Button>
          </div>
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
      <WorkoutRecapModal open={recapOpen} onOpenChange={setRecapOpen} />
    </div>
  );
}

// =====================================================================
// WorkoutTypeBadge
// =====================================================================
function WorkoutTypeBadge({ type }: { type: WorkoutType }) {
  const map: Record<WorkoutType, { label: string; color: string; bg: string }> = {
    upperA: { label: "Upper A", color: "var(--color-workout-a)", bg: "var(--color-workout-a-bg)" },
    upperB: { label: "Upper B", color: "var(--color-workout-a)", bg: "var(--color-workout-a-bg)" },
    lowerA: { label: "Lower A", color: "var(--color-workout-b)", bg: "var(--color-workout-b-bg)" },
    lowerB: { label: "Lower B", color: "var(--color-workout-b)", bg: "var(--color-workout-b-bg)" },
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
  if (session.type === "rest") return null;
  const def = PROGRAM[session.type];
  const trainingIds = new Set(def.training.map((e) => e.id));
  const totalTrainingSets = def.training.reduce((s, e) => s + e.sets, 0);
  const doneTrainingSets = sets.filter((s) => s.done && trainingIds.has(s.exerciseId)).length;

  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Training</div>
      <div className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums">
        {doneTrainingSets}
        <span className="text-muted-foreground">/{totalTrainingSets}</span>
      </div>
    </div>
  );
}

// =====================================================================
// SectionHeader
// =====================================================================
function SectionHeader({ title, index }: { title: string; index: number }) {
  return (
    <motion.div {...stagger(index)} className="pt-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">{title}</div>
    </motion.div>
  );
}

// =====================================================================
// ChecklistRow
// =====================================================================
function ChecklistRow({ exercise, sessionId, existingSets, onChanged, index }: { exercise: Exercise; sessionId: string; existingSets: SetLog[]; onChanged: () => void; index: number }) {
  const toggleSet = async (setNumber: number, currentDone: boolean) => {
    try {
      await api.put("/workouts/sets", {
        sessionId,
        exerciseId: exercise.id,
        setNumber,
        done: !currentDone,
      });
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const setsArr = Array.from({ length: exercise.sets }, (_, i) => i + 1);
  const completed = existingSets.filter((s) => s.done).length;
  const allDone = completed === exercise.sets;

  return (
    <motion.div {...stagger(index)}>
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className={`text-sm font-medium truncate ${allDone ? "line-through text-muted-foreground" : ""}`}>{exercise.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums flex-shrink-0">
                {exercise.sets > 1 ? `${exercise.sets} x ${exercise.reps}` : exercise.reps !== "-" ? exercise.reps : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {setsArr.map((setNumber) => {
                const existing = existingSets.find((s) => s.setNumber === setNumber);
                const isDone = existing?.done ?? false;
                return <Checkbox key={setNumber} checked={isDone} onCheckedChange={() => toggleSet(setNumber, isDone)} />;
              })}
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
  const [local, setLocal] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (let i = 1; i <= exercise.sets; i++) {
      const existing = existingSets.find((s) => s.setNumber === i);
      m[i] = existing?.weight != null ? existing.weight.toString() : "";
    }
    return m;
  });

  useEffect(() => {
    setLocal((prev) => {
      const m = { ...prev };
      for (let i = 1; i <= exercise.sets; i++) {
        const existing = existingSets.find((s) => s.setNumber === i);
        m[i] = existing?.weight != null ? existing.weight.toString() : "";
      }
      return m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSets.length]);

  const upsertSet = async (setNumber: number, patch: { weight?: number | null; done?: boolean }) => {
    try {
      await api.put("/workouts/sets", { sessionId, exerciseId: exercise.id, setNumber, ...patch });
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const commitWeight = (setNumber: number) => {
    const v = local[setNumber];
    const n = v === "" ? null : parseFloat(v);
    if (v !== "" && (n === null || isNaN(n) || n < 0)) return;
    void upsertSet(setNumber, { weight: n });
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
          <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-baseline gap-2 min-w-0 flex-1">
              <span className="text-sm font-semibold truncate">{exercise.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">
                {exercise.sets} x {exercise.reps}
              </span>
            </div>
            <div className="text-xs font-mono tabular-nums flex-shrink-0" style={{ color: completed === exercise.sets ? "var(--color-income)" : "var(--color-muted-foreground)" }}>
              {completed}/{exercise.sets}
            </div>
          </div>

          {lastSession && (
            <div className="text-[11px] text-muted-foreground mb-3 font-mono tabular-nums flex items-center gap-1.5">
              <span className="text-muted-foreground/60">Last:</span>
              <span className="font-medium text-foreground">{lastSession.weight}kg</span>
            </div>
          )}

          <div className="space-y-1.5">
            {setsArr.map((setNumber) => {
              const existing = existingSets.find((s) => s.setNumber === setNumber);
              const isDone = existing?.done ?? false;
              const localVal = local[setNumber] ?? "";

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
                      value={localVal}
                      onChange={(e) => setLocal((m) => ({ ...m, [setNumber]: e.target.value }))}
                      onBlur={() => commitWeight(setNumber)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-7 w-24 font-mono tabular-nums text-right"
                    />
                    <span className="text-xs text-muted-foreground">kg</span>
                    <span className="text-muted-foreground/40 px-1">-</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">{exercise.reps} reps</span>
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
    { type: "upperA", label: "Upper A", desc: "Chest/Shoulders/Arms - machines" },
    { type: "lowerA", label: "Lower A", desc: "Legs - press + extensions" },
    { type: "upperB", label: "Upper B", desc: "Chest/Shoulders/Arms - barbells + cables" },
    { type: "lowerB", label: "Lower B", desc: "Legs - same lifts, different warmup" },
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
