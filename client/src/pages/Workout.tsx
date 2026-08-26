import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { BarChart3, Check, ChevronLeft, ChevronRight, Dumbbell, Footprints, Minus, Pause, Play, Plus, RotateCcw, Timer, Trash2, Trophy, X } from "lucide-react";
import { AxiosError } from "axios";
import { PROGRAM, WORKOUT_TYPE_STYLE, exerciseTarget, exercisesFor, workoutLabel, type Exercise, type WorkoutType } from "../lib/workoutProgram";

// Recharts is ~370 kB and only the history modal needs it. Loading it lazily keeps
// it out of the workout page itself, which is the screen actually used at the gym.
const importRecapModal = () => import("../components/WorkoutRecapModal");
const WorkoutRecapModal = lazy(() => importRecapModal().then((m) => ({ default: m.WorkoutRecapModal })));

// =====================================================================
// Types
// =====================================================================
type Session = {
  _id: string;
  date: string;
  type: WorkoutType;
  walkMinutes: number;
  walkDistanceKm: number;
  completedAt: string | null;
  note: string;
};

type SetLog = {
  _id?: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  done: boolean;
};

type SetPatch = Partial<Pick<SetLog, "weight" | "reps" | "done">>;

type LastEntry = { weight: number; reps: number | null; when: string; best: number };
type LastWeights = Record<string, LastEntry>;

// =====================================================================
// Helpers
// =====================================================================
function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function shiftDay(iso: string, by: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatRelativeDay(iso: string): string {
  const days = Math.round((Date.parse(todayISO() + "T00:00:00Z") - Date.parse(iso.slice(0, 10) + "T00:00:00Z")) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatKg(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(1);
}

/** Volume for one set. Sets logged before reps were captured fall back to bare weight. */
function setVolume(s: SetLog): number {
  if (s.weight == null || s.weight <= 0) return 0;
  return s.reps != null && s.reps > 0 ? s.weight * s.reps : s.weight;
}

function parseNumeric(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined; // invalid, ignore
  return n;
}

// ===== Motion (capped so a long list never crawls in) =====
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: Math.min(i, 8) * 0.03 },
});

const REST_PRESETS = [60, 90, 120, 180];
const REST_STORAGE_KEY = "workout:rest-seconds";

// =====================================================================
// MAIN
// =====================================================================
export default function Workout() {
  const [session, setSession] = useState<Session | null>(null);
  const [suggested, setSuggested] = useState<WorkoutType>("upper");
  const [sets, setSets] = useState<SetLog[]>([]);
  const [lastWeights, setLastWeights] = useState<LastWeights>({});
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  // Kept mounted after the first open so closing animates and reopening is instant.
  const [recapMounted, setRecapMounted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const navigate = useNavigate();

  // Mirrors `sets` so optimistic updates can read the current value synchronously
  // instead of racing a queued state update.
  const setsRef = useRef<SetLog[]>([]);
  const writeSets = useCallback((next: SetLog[]) => {
    setsRef.current = next;
    setSets(next);
  }, []);

  const isToday = selectedDate === todayISO();
  const isCompleted = !!session?.completedAt;
  const exercises = useMemo(() => (session ? exercisesFor(session.type) : []), [session]);

  // ----- Loaders -----
  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedDate === todayISO()) {
        const r = await api.get<{ session: Session | null; suggested: WorkoutType | null }>("/workouts/today");
        setSession(r.data.session);
        if (r.data.suggested) setSuggested(r.data.suggested);
      } else {
        const r = await api.get<Session | null>(`/workouts/session?date=${selectedDate}`);
        setSession(r.data);
      }
    } catch (e) {
      toast.error(getApiError(e));
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const loadSets = useCallback(
    async (sessionId: string) => {
      try {
        const r = await api.get<SetLog[]>(`/workouts/session/${sessionId}/sets`);
        writeSets(r.data);
      } catch (e) {
        toast.error(getApiError(e));
      }
    },
    [writeSets],
  );

  // Scoped to the day being viewed: browsing an old session should show what was
  // lifted before it, not the newest numbers on record.
  const loadLastWeights = useCallback(async () => {
    try {
      const r = await api.get<LastWeights>(`/workouts/last-weights?before=${selectedDate}`);
      setLastWeights(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Warm the history chunk once the page is idle. It stays out of the critical path
  // for getting into a workout, but is already cached by the time History is tapped.
  useEffect(() => {
    const w = window as typeof window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => void importRecapModal());
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => void importRecapModal(), 2500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    void loadLastWeights();
  }, [loadLastWeights]);

  const sessionId = session?._id ?? null;
  useEffect(() => {
    if (sessionId) void loadSets(sessionId);
    else writeSets([]);
  }, [sessionId, loadSets, writeSets]);

  // ----- Derived -----
  const exerciseIds = useMemo(() => new Set(exercises.map((e) => e.id)), [exercises]);
  const totalSets = useMemo(() => exercises.reduce((sum, e) => sum + e.sets, 0), [exercises]);
  const doneSets = useMemo(() => sets.filter((s) => s.done && exerciseIds.has(s.exerciseId)).length, [sets, exerciseIds]);
  const volume = useMemo(() => sets.reduce((sum, s) => (s.done && exerciseIds.has(s.exerciseId) ? sum + setVolume(s) : sum), 0), [sets, exerciseIds]);
  const percent = totalSets === 0 ? 0 : Math.round((doneSets / totalSets) * 100);

  const rest = useRestTimer();

  // ----- Set mutations (optimistic) -----
  const saveSet = useCallback(
    async (exerciseId: string, setNumber: number, patch: SetPatch) => {
      if (!session) return;
      const before = setsRef.current;
      const index = before.findIndex((s) => s.exerciseId === exerciseId && s.setNumber === setNumber);
      const optimistic: SetLog =
        index === -1 ? { sessionId: session._id, exerciseId, setNumber, weight: null, reps: null, done: false, ...patch } : { ...before[index], ...patch };

      writeSets(index === -1 ? [...before, optimistic] : before.map((s, i) => (i === index ? optimistic : s)));

      try {
        const r = await api.put<SetLog>("/workouts/sets", { sessionId: session._id, exerciseId, setNumber, ...patch });
        // Reconcile with the server row (picks up its _id) without discarding an edit
        // the user made to a different field while this request was in flight.
        writeSets(setsRef.current.map((s) => (s.exerciseId === exerciseId && s.setNumber === setNumber ? { ...s, _id: r.data._id } : s)));
      } catch (e) {
        toast.error(getApiError(e));
        writeSets(before);
      }
    },
    [session, writeSets],
  );

  const toggleSetDone = useCallback(
    (exerciseId: string, setNumber: number, nextDone: boolean) => {
      void saveSet(exerciseId, setNumber, { done: nextDone });
      if (nextDone) rest.start();
    },
    [saveSet, rest],
  );

  // ----- Session actions -----
  const startSession = async (type: WorkoutType) => {
    try {
      const r = await api.post<Session>("/workouts/session", { date: selectedDate, type });
      setSession(r.data);
      setPickerOpen(false);
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const patchSession = async (patch: Partial<Session>) => {
    if (!session) return;
    const before = session;
    setSession({ ...session, ...patch });
    try {
      const r = await api.patch<Session>(`/workouts/session/${session._id}`, patch);
      setSession(r.data);
    } catch (e) {
      toast.error(getApiError(e));
      setSession(before);
    }
  };

  const completeSession = async () => {
    if (!session) return;
    setConfirmEmptyOpen(false);
    rest.stop();
    await patchSession({ completedAt: new Date().toISOString() });
    void loadLastWeights();
    // Finishing a session ticks the day on the habit tracker, so land the user there.
    navigate("/");
  };

  const requestComplete = () => {
    if (doneSets === 0 && totalSets > 0) setConfirmEmptyOpen(true);
    else void completeSession();
  };

  const deleteSession = async () => {
    if (!session) return;
    setDeleteOpen(false);
    try {
      await api.delete(`/workouts/session/${session._id}`);
      setSession(null);
      writeSets([]);
      rest.stop();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const changeType = async (type: WorkoutType) => {
    if (!session) return;
    setPickerOpen(false);
    if (type === session.type) return;
    writeSets([]); // the server drops the old type's sets too
    await patchSession({ type });
  };

  // =====================================================================
  return (
    <div className="w-full max-w-[860px] space-y-4">
      {/* ===== Header ===== */}
      <motion.header {...fadeUp} className="flex items-center justify-between gap-3">
        {/* The phone top bar already names the page, so the h1 is desktop-only chrome. */}
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <Dumbbell className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Workout</h1>
        </div>
        <h1 className="sr-only md:hidden">Workout</h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-9"
          onClick={() => {
            setRecapMounted(true);
            setRecapOpen(true);
          }}
        >
          <BarChart3 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          History
        </Button>
      </motion.header>

      {/* ===== Date navigation ===== */}
      <motion.nav {...stagger(1)} aria-label="Select workout day" className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Previous day" onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>

        <button
          type="button"
          onClick={() => setSelectedDate(todayISO())}
          disabled={isToday}
          aria-label={isToday ? `${formatDay(selectedDate)}, today` : `${formatDay(selectedDate)}. Jump to today`}
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-transparent px-1 text-sm font-medium transition-colors enabled:hover:border-border enabled:hover:bg-muted/60 disabled:cursor-default"
        >
          <span className="truncate">{formatDay(selectedDate)}</span>
          {isToday ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today</span>
          ) : (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="hidden sm:inline">Jump to </span>today
            </span>
          )}
        </button>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Next day"
          disabled={isToday}
          title={isToday ? "Workouts cannot be logged in the future" : undefined}
          onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </motion.nav>

      {/* ===== Body ===== */}
      {loading ? (
        <WorkoutSkeleton />
      ) : !session ? (
        <EmptyState suggested={suggested} onStart={startSession} onPick={() => setPickerOpen(true)} />
      ) : session.type === "rest" ? (
        <>
          <RestDayCard session={session} onSwitch={() => setPickerOpen(true)} />
          <SessionNote session={session} onSave={patchSession} />
          <DangerZone onDelete={() => setDeleteOpen(true)} />
        </>
      ) : (
        <>
          <SessionHero session={session} percent={percent} doneSets={doneSets} totalSets={totalSets} volume={volume} onChangeType={() => setPickerOpen(true)} />

          <h2 className="sr-only">Exercises</h2>
          <div className="grid gap-3">
            {exercises.map((exercise, i) => (
              <ExerciseCard
                key={exercise.id}
                index={i + 2}
                exercise={exercise}
                sets={sets.filter((s) => s.exerciseId === exercise.id)}
                last={lastWeights[exercise.id]}
                readOnly={isCompleted}
                onSave={saveSet}
                onToggleDone={toggleSetDone}
              />
            ))}
          </div>

          <SessionNote session={session} onSave={patchSession} />
          <DangerZone onDelete={() => setDeleteOpen(true)} />

          <FinishBar percent={percent} doneSets={doneSets} totalSets={totalSets} volume={volume} completedAt={session.completedAt} onComplete={requestComplete} onReopen={() => void patchSession({ completedAt: null })} />

          {/* The countdown is the one thing that has to stay reachable while scrolling. */}
          <AnimatePresence>{rest.running && <FloatingRestTimer rest={rest} />}</AnimatePresence>
        </>
      )}

      {/* ===== Dialogs ===== */}
      <WorkoutPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        suggested={suggested}
        currentType={session?.type ?? null}
        onPick={(type) => (session ? void changeType(type) : void startSession(type))}
      />
      {recapMounted && (
        <Suspense fallback={<RecapLoadingOverlay />}>
          <WorkoutRecapModal open={recapOpen} onOpenChange={setRecapOpen} />
        </Suspense>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatDay(selectedDate)} — {session ? workoutLabel(session.type) : ""}. Every set logged for this day is removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={() => void deleteSession()}>
              Delete session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEmptyOpen} onOpenChange={setConfirmEmptyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish with nothing logged?</AlertDialogTitle>
            <AlertDialogDescription>Not a single set is ticked. Marking this complete records an empty session.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Keep going
            </AlertDialogCancel>
            <AlertDialogAction variant="default" size="default" onClick={() => void completeSession()}>
              Complete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =====================================================================
// Shared bits
// =====================================================================
function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${className}`}>{children}</div>;
}

function WorkoutTypeBadge({ type }: { type: WorkoutType }) {
  const v = WORKOUT_TYPE_STYLE[type];
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: v.fg, background: v.bg, borderColor: v.border }}>
      {v.label}
    </span>
  );
}

function ProgressRing({ percent, size = 48 }: { percent: number; size?: number }) {
  const stroke = 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-foreground)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (Math.min(percent, 100) / 100) * c }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums">{percent}%</div>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className="h-full rounded-full bg-foreground"
        initial={false}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

/** Shown for the moment the history chunk is still downloading. */
function RecapLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm" role="status" aria-label="Loading workout history">
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" aria-hidden />
        <span className="text-sm font-medium">Loading history…</span>
      </div>
    </div>
  );
}

function WorkoutSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading workout">
      <Skeleton className="h-24 w-full rounded-xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ suggested, onStart, onPick }: { suggested: WorkoutType; onStart: (t: WorkoutType) => void; onPick: () => void }) {
  return (
    <motion.div {...stagger(2)}>
      <Card>
        <CardContent className="px-4 py-2 text-center sm:px-6">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Dumbbell className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="text-base font-semibold">No session for this day</div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Next in your rotation is <span className="font-medium text-foreground">{workoutLabel(suggested)}</span>.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="default" size="default" onClick={() => onStart(suggested)}>
              Start {workoutLabel(suggested)}
            </Button>
            <Button variant="outline" size="default" onClick={onPick}>
              Pick another
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SessionHero({
  session,
  percent,
  doneSets,
  totalSets,
  volume,
  onChangeType,
}: {
  session: Session;
  percent: number;
  doneSets: number;
  totalSets: number;
  volume: number;
  onChangeType: () => void;
}) {
  return (
    <motion.section {...stagger(1)} aria-label="Session summary">
      <Card>
        <CardContent className="px-3 py-0 sm:px-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <ProgressRing percent={percent} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Eyebrow>Session</Eyebrow>
                <WorkoutTypeBadge type={session.type} />
              </div>
              <div className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{workoutLabel(session.type)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
                <span className="font-mono tabular-nums">
                  <span className="font-semibold text-foreground">{doneSets}</span>/{totalSets} sets
                </span>
                <span aria-hidden>·</span>
                <span className="font-mono tabular-nums">
                  <span className="font-semibold text-foreground">{formatKg(volume)}</span> kg
                </span>
              </div>
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 sm:w-auto sm:px-3" aria-label="Change workout type" onClick={onChangeType}>
              <RotateCcw className="h-4 w-4 sm:mr-1.5" aria-hidden />
              <span className="hidden text-sm sm:inline">Change</span>
            </Button>
          </div>

          {session.completedAt && (
            <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-foreground" aria-hidden />
              Completed at {new Date(session.completedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.section>
  );
}

// =====================================================================
// Exercise card
// =====================================================================
function ExerciseCard({
  exercise,
  sets,
  last,
  index,
  readOnly,
  onSave,
  onToggleDone,
}: {
  exercise: Exercise;
  sets: SetLog[];
  last: LastEntry | undefined;
  index: number;
  readOnly: boolean;
  onSave: (exerciseId: string, setNumber: number, patch: SetPatch) => void;
  onToggleDone: (exerciseId: string, setNumber: number, next: boolean) => void;
}) {
  // Historical sessions may hold more rows than the current three; never hide them.
  const highestLogged = sets.reduce((m, s) => Math.max(m, s.setNumber), 0);
  const rowCount = Math.max(exercise.sets, highestLogged);
  const rows = Array.from({ length: rowCount }, (_, i) => i + 1);

  const byNumber = useMemo(() => new Map(sets.map((s) => [s.setNumber, s])), [sets]);
  const done = sets.filter((s) => s.done).length;
  const allDone = rowCount > 0 && done >= rowCount;

  const heaviest = sets.reduce((m, s) => Math.max(m, s.weight ?? 0), 0);
  const isPr = !!last && heaviest > last.best;


  const [collapsed, setCollapsed] = useState(false);
  // Fold a finished exercise away so the list stays scannable, but never fight a
  // user who deliberately reopened it.
  const autoCollapsed = useRef(false);
  useEffect(() => {
    if (allDone && !autoCollapsed.current) {
      autoCollapsed.current = true;
      setCollapsed(true);
    }
    if (!allDone) autoCollapsed.current = false;
  }, [allDone]);

  return (
    <motion.section {...stagger(index)} aria-label={exercise.name}>
      <Card style={allDone ? { boxShadow: "inset 3px 0 0 0 var(--color-foreground)" } : undefined}>
        <CardContent className="px-3 py-0 sm:px-4">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className={`truncate text-sm font-semibold ${allDone ? "text-muted-foreground" : ""}`}>{exercise.name}</h3>
                {isPr && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">
                    <Trophy className="h-2.5 w-2.5" aria-hidden />
                    PR
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                <span className="font-mono tabular-nums">Target {exerciseTarget(exercise)}</span>
                {last && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-mono tabular-nums">
                      Last {formatKg(last.weight)}kg{last.reps ? ` × ${last.reps}` : ""} <span className="text-muted-foreground/70">({formatRelativeDay(last.when)})</span>
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${allDone ? "text-foreground" : "text-muted-foreground"}`}>
              {done}/{rowCount}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="sets"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-1 pt-2">
                  {rows.map((setNumber) => (
                    <SetRow key={setNumber} exercise={exercise} setNumber={setNumber} log={byNumber.get(setNumber)} last={last} readOnly={readOnly} onSave={onSave} onToggleDone={onToggleDone} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.section>
  );
}

// =====================================================================
// Set row — weight and reps are both entered
// =====================================================================
function SetRow({
  exercise,
  setNumber,
  log,
  last,
  readOnly,
  onSave,
  onToggleDone,
}: {
  exercise: Exercise;
  setNumber: number;
  log: SetLog | undefined;
  last: LastEntry | undefined;
  readOnly: boolean;
  onSave: (exerciseId: string, setNumber: number, patch: SetPatch) => void;
  onToggleDone: (exerciseId: string, setNumber: number, next: boolean) => void;
}) {
  const serverWeight = log?.weight != null ? formatKg(log.weight) : "";
  const serverReps = log?.reps != null ? String(log.reps) : "";
  const isDone = log?.done ?? false;

  const [weight, setWeight] = useState(serverWeight);
  const [reps, setReps] = useState(serverReps);

  // Resync when the stored values themselves change, not just when the number of
  // rows does — editing a value used to leave the input showing stale text.
  useEffect(() => setWeight(serverWeight), [serverWeight]);
  useEffect(() => setReps(serverReps), [serverReps]);

  const weightId = `w-${exercise.id}-${setNumber}`;
  const repsId = `r-${exercise.id}-${setNumber}`;
  const checkId = `c-${exercise.id}-${setNumber}`;

  const commit = (field: "weight" | "reps", raw: string) => {
    const parsed = parseNumeric(raw);
    if (parsed === undefined) {
      // Invalid entry: snap back to what is stored rather than saving garbage.
      if (field === "weight") setWeight(serverWeight);
      else setReps(serverReps);
      return;
    }
    const current = field === "weight" ? (log?.weight ?? null) : (log?.reps ?? null);
    if (parsed === current) return;
    onSave(exercise.id, setNumber, { [field]: parsed } as SetPatch);
  };

  // Enter walks the row: weight -> reps -> next set's weight.
  const advanceFrom = (field: "weight" | "reps") => {
    const nextId = field === "weight" ? repsId : `w-${exercise.id}-${setNumber + 1}`;
    const el = document.getElementById(nextId) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    } else {
      (document.getElementById(field === "weight" ? weightId : repsId) as HTMLInputElement | null)?.blur();
    }
  };

  const rowLabel = `${exercise.name}, set ${setNumber}`;

  return (
    <motion.div layout="position" className={`flex items-center gap-1 rounded-lg px-1 py-1 transition-colors sm:gap-2 sm:px-1.5 ${isDone ? "bg-muted" : ""}`}>
      <label htmlFor={checkId} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted/70">
        <Checkbox id={checkId} checked={isDone} disabled={readOnly} aria-label={`Mark ${rowLabel} done`} onCheckedChange={(checked) => onToggleDone(exercise.id, setNumber, checked === true)} />
      </label>

      <span aria-hidden className="w-3 shrink-0 font-mono text-xs font-medium tabular-nums text-muted-foreground sm:w-4">
        {setNumber}
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <NumberField
          id={weightId}
          value={weight}
          onChange={setWeight}
          onCommit={(v) => commit("weight", v)}
          onEnter={() => advanceFrom("weight")}
          suffix="kg"
          step="0.5"
          disabled={readOnly}
          ariaLabel={`Weight for ${rowLabel} in kilograms`}
          placeholder={last ? formatKg(last.weight) : "0"}
        />
        <span aria-hidden className="shrink-0 px-0.5 text-xs text-muted-foreground/50">
          ×
        </span>
        <NumberField
          id={repsId}
          value={reps}
          onChange={setReps}
          onCommit={(v) => commit("reps", v)}
          onEnter={() => advanceFrom("reps")}
          suffix="reps"
          step="1"
          disabled={readOnly}
          ariaLabel={`Reps for ${rowLabel}`}
          placeholder={String(exercise.targetReps)}
        />
      </div>

    </motion.div>
  );
}

function NumberField({
  id,
  value,
  onChange,
  onCommit,
  onEnter,
  suffix,
  step,
  disabled,
  ariaLabel,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  onEnter: () => void;
  suffix: string;
  step: string;
  disabled: boolean;
  ariaLabel: string;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit((e.target as HTMLInputElement).value);
            onEnter();
          }
        }}
        className="h-11 w-full min-w-0 px-2 pr-7 text-right font-mono text-base tabular-nums sm:pr-9 sm:text-sm"
      />
      <span aria-hidden className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground sm:right-2.5 sm:text-[11px]">
        {suffix}
      </span>
    </div>
  );
}

// =====================================================================
// Rest timer
// =====================================================================
type RestTimer = ReturnType<typeof useRestTimer>;

/**
 * Holds only state that changes on user action — never the per-tick clock. The
 * countdown itself ticks inside RestTimerBar, so a running timer does not re-render
 * the whole page (and every set row in it) four times a second.
 */
function useRestTimer() {
  const [duration, setDuration] = useState(() => {
    const stored = Number(localStorage.getItem(REST_STORAGE_KEY));
    return REST_PRESETS.includes(stored) ? stored : 90;
  });
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [paused, setPaused] = useState<number | null>(null); // seconds left while paused

  const running = endsAt !== null || paused !== null;

  const start = useCallback(() => {
    setPaused(null);
    setEndsAt(Date.now() + duration * 1000);
  }, [duration]);

  const stop = useCallback(() => {
    setEndsAt(null);
    setPaused(null);
  }, []);

  const toggle = useCallback(() => {
    if (paused !== null) {
      setEndsAt(Date.now() + paused * 1000);
      setPaused(null);
    } else if (endsAt !== null) {
      setPaused(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
      setEndsAt(null);
    }
  }, [paused, endsAt]);

  const adjust = useCallback((delta: number) => {
    setEndsAt((e) => (e === null ? e : e + delta * 1000));
    setPaused((p) => (p === null ? p : Math.max(0, p + delta)));
  }, []);

  const changeDuration = useCallback((seconds: number) => {
    setDuration(seconds);
    localStorage.setItem(REST_STORAGE_KEY, String(seconds));
  }, []);

  return useMemo(
    () => ({ duration, changeDuration, endsAt, pausedAt: paused, running, start, stop, toggle, adjust }),
    [duration, changeDuration, endsAt, paused, running, start, stop, toggle, adjust],
  );
}

function RestTimerBar({ rest }: { rest: RestTimer }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { endsAt, pausedAt } = rest;

  // The clock lives here, not in the hook, so only this bar repaints each tick.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const remaining = pausedAt !== null ? pausedAt : endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const isPaused = pausedAt !== null;
  const finished = endsAt !== null && !isPaused && remaining === 0;

  const firedFor = useRef<number | null>(null);
  useEffect(() => {
    if (finished && endsAt !== null && firedFor.current !== endsAt) {
      firedFor.current = endsAt;
      navigator.vibrate?.([120, 80, 120]);
    }
  }, [finished, endsAt]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = rest.duration === 0 ? 0 : Math.min(100, ((rest.duration - remaining) / rest.duration) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Timer className={`h-4 w-4 shrink-0 ${finished ? "text-foreground" : "text-muted-foreground"}`} aria-hidden />
        <span className="font-mono text-lg font-semibold tabular-nums" aria-live="polite">
          {finished ? "Go" : `${mins}:${String(secs).padStart(2, "0")}`}
        </span>

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Subtract 15 seconds" onClick={() => rest.adjust(-15)}>
            <Minus className="h-3 w-3" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Add 15 seconds" onClick={() => rest.adjust(15)}>
            <Plus className="h-3 w-3" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={isPaused ? "Resume rest timer" : "Pause rest timer"} onClick={rest.toggle}>
            {isPaused ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-7 px-2 font-mono text-[11px]" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}>
            {rest.duration}s
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Dismiss rest timer" onClick={rest.stop}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {settingsOpen && (
        <div className="flex items-center gap-1.5">
          {REST_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                rest.changeDuration(p);
                setSettingsOpen(false);
              }}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${p === rest.duration ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
            >
              {p}s
            </button>
          ))}
        </div>
      )}

      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// =====================================================================
// Sticky action bar
// =====================================================================
function FinishBar({
  percent,
  doneSets,
  totalSets,
  volume,
  completedAt,
  onComplete,
  onReopen,
}: {
  percent: number;
  doneSets: number;
  totalSets: number;
  volume: number;
  completedAt: string | null;
  onComplete: () => void;
  onReopen: () => void;
}) {
  return (
    <motion.div {...stagger(9)}>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold tabular-nums">
                {doneSets}
                <span className="text-muted-foreground">/{totalSets}</span>
              </span>
              <span className="truncate text-[11px] text-muted-foreground">sets · {formatKg(volume)} kg</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar percent={percent} />
            </div>
          </div>

          {completedAt ? (
            <Button variant="outline" size="default" className="h-11 shrink-0" onClick={onReopen}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              Reopen
            </Button>
          ) : (
            <Button variant="default" size="default" className="h-11 shrink-0 px-5" onClick={onComplete}>
              <Check className="h-4 w-4 mr-1.5" aria-hidden />
              Finish
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Pinned above the fold so the countdown stays visible while scrolling the list. */
function FloatingRestTimer({ rest }: { rest: RestTimer }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="sticky bottom-3 z-20 mx-auto w-full max-w-md"
    >
      <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <RestTimerBar rest={rest} />
      </div>
    </motion.div>
  );
}

// =====================================================================
// Session note
// =====================================================================
function SessionNote({ session, onSave }: { session: Session; onSave: (patch: Partial<Session>) => void }) {
  const [value, setValue] = useState(session.note ?? "");
  const [saved, setSaved] = useState(false);
  const sessionId = session._id;
  const stored = session.note ?? "";

  useEffect(() => {
    setValue(stored);
  }, [sessionId, stored]);

  // Debounced autosave, matching the notes behaviour elsewhere in the app.
  useEffect(() => {
    if (value === stored) return;
    const id = window.setTimeout(() => {
      onSave({ note: value });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, sessionId]);

  return (
    <motion.section {...stagger(8)} aria-label="Session note">
      <Card>
        <CardContent className="px-3 py-0 sm:px-4">
          <div className="mb-1.5 flex items-center justify-between">
            <Eyebrow>Notes</Eyebrow>
            <AnimatePresence>
              {saved && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[10px] font-medium text-muted-foreground">
                  Saved
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            aria-label="Notes for this session"
            placeholder="How did it feel? Anything to remember for next time…"
            className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </CardContent>
      </Card>
    </motion.section>
  );
}

function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="flex justify-center pt-1">
      <Button variant="ghost" size="sm" onClick={onDelete} className="text-xs text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3 w-3 mr-1.5" aria-hidden />
        Delete this session
      </Button>
    </div>
  );
}

// =====================================================================
// Rest day
// =====================================================================
function RestDayCard({ session, onSwitch }: { session: Session; onSwitch: () => void }) {
  return (
    <motion.section {...stagger(1)} aria-label="Rest day">
      <Card>
        <CardContent className="px-3 py-0 sm:px-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted">
              <Footprints className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Eyebrow>Session</Eyebrow>
                <WorkoutTypeBadge type={session.type} />
              </div>
              <div className="mt-0.5 text-2xl font-semibold tracking-tight">Rest day</div>
              <p className="mt-0.5 text-xs text-muted-foreground">Nothing to log. Recover.</p>
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 sm:w-auto sm:px-3" aria-label="Change workout type" onClick={onSwitch}>
              <RotateCcw className="h-4 w-4 sm:mr-1.5" aria-hidden />
              <span className="hidden text-sm sm:inline">Change</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.section>
  );
}

// =====================================================================
// Picker dialog
// =====================================================================
function WorkoutPickerDialog({
  open,
  onOpenChange,
  suggested,
  currentType,
  onPick,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  suggested: WorkoutType;
  currentType: WorkoutType | null;
  onPick: (type: WorkoutType) => void;
}) {
  const options: WorkoutType[] = ["upper", "lower", "rest"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentType ? "Change workout" : "Pick a workout"}</DialogTitle>
        </DialogHeader>

        {currentType && currentType !== "rest" && <p className="text-xs text-muted-foreground">Switching clears the sets already logged for this session.</p>}

        <div className="space-y-2">
          {options.map((type) => {
            const isSuggested = type === suggested && !currentType;
            const isCurrent = type === currentType;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onPick(type)}
                disabled={isCurrent}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <WorkoutTypeBadge type={type} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{workoutLabel(type)}</div>
                    <div className="text-[11px] text-muted-foreground">{type === "rest" ? "No training" : `${PROGRAM[type].length} exercises`}</div>
                  </div>
                </div>
                {isSuggested && <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">Suggested</span>}
                {isCurrent && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current</span>}
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
