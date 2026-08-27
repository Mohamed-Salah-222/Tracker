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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CloudOff, Dumbbell, Footprints, Minus, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Settings, Timer, TimerOff, Trash2, TrendingUp, TriangleAlert, Trophy, X, Image as ImageIcon, Info } from "lucide-react";
import { AxiosError } from "axios";
import { exerciseCount, exerciseTarget, exercisesFor, workoutLabel, workoutTypeStyle, type Exercise, type WorkoutType } from "../lib/workoutProgram";
import { ALL_MOVEMENT_IDS, DEFAULT_SPLIT_ID, REST, SPLITS, getSplit, isRestDay, movementName, progressionFor, type Split } from "../lib/workoutSplits";
import { analyseTrend, estimate1RM, suggestLoad, type ExerciseHistory, type SessionPoint } from "../lib/progression";
import { exerciseImagePath, exerciseInfo } from "../lib/exerciseInfo";
import { BAR_OPTIONS, describeSide, loadBar } from "../lib/plates";
import { flush as flushSets, forgetSession, onSetSynced, pendingFor, queueSet, useSetQueue } from "../lib/setQueue";
import { primeBeep, restOverAlert } from "../lib/beep";
import { useWakeLock } from "../lib/wakeLock";

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
  splitId?: string;
  cycleIndex?: number | null;
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
  /** Optional 1-10 effort rating; sharpens the one-rep-max estimate when present. */
  rpe: number | null;
  done: boolean;
};

type SetPatch = Partial<Pick<SetLog, "weight" | "reps" | "rpe" | "done">>;

type LastEntry = ExerciseHistory & { recent?: SessionPoint[] };
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

type PlanSlot = { id: string; sets: number; reps: number; repsMin?: number };

/** A day's exercises: the user's own list if they have edited it, otherwise the catalogue default. */
function resolveDay(dayKey: string, plans: Record<string, PlanSlot[]>): Exercise[] {
  const custom = plans[dayKey];
  if (!custom) return exercisesFor(dayKey);
  return custom.map((sl) => ({ id: sl.id, name: movementName(sl.id), sets: sl.sets, targetReps: sl.reps, targetRepsMin: sl.repsMin ?? sl.reps }));
}

type LastSession = { type: string; splitId: string; cycleIndex: number | null; date: string } | null;
type TodayResponse = { session: Session | null; splitId: string; hasChosenSplit: boolean; last: LastSession; stallNoticeSessions?: number; stallDeloadSessions?: number };

/**
 * Where the next session lands in the split's cycle. If the last session recorded
 * its position we step on from there; otherwise we look its day up in the cycle, and
 * failing that we start at the top. Switching splits resets to the start.
 */
function nextIndexInCycle(splitId: string, last: LastSession): number {
  const cycle = getSplit(splitId).cycle;
  if (!last || last.splitId !== splitId) return 0;
  const from = last.cycleIndex ?? cycle.indexOf(last.type);
  if (from < 0) return 0;
  return (from + 1) % cycle.length;
}

function nextDayInCycle(splitId: string, last: LastSession): string {
  const cycle = getSplit(splitId).cycle;
  return cycle[nextIndexInCycle(splitId, last)] ?? cycle[0];
}

const REST_PRESETS = [60, 90, 120, 180];
const REST_STORAGE_KEY = "workout:rest-seconds";
const REST_ENABLED_KEY = "workout:rest-timer-enabled";

// =====================================================================
// MAIN
// =====================================================================
export default function Workout() {
  const [session, setSession] = useState<Session | null>(null);
  const [suggested, setSuggested] = useState<WorkoutType>("upper");
  const [splitId, setSplitId] = useState<string>(DEFAULT_SPLIT_ID);
  const [hasChosenSplit, setHasChosenSplit] = useState(true);
  const [nextCycleIndex, setNextCycleIndex] = useState<number>(0);
  const [stallNoticeAt, setStallNoticeAt] = useState(3);
  const [stallDeloadAt, setStallDeloadAt] = useState(5);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);
  /** dayKey -> the user's own exercise list, replacing the catalogue default. */
  const [dayPlans, setDayPlans] = useState<Record<string, PlanSlot[]>>({});
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [infoFor, setInfoFor] = useState<{ id: string; suggested: number | null } | null>(null);
  const [editDayOpen, setEditDayOpen] = useState(false);
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

  const queue = useSetQueue();
  const isToday = selectedDate === todayISO();
  const isCompleted = !!session?.completedAt;
  const exercises = useMemo(() => (session ? resolveDay(session.type, dayPlans) : []), [session, dayPlans]);
  const isCustomised = !!(session && dayPlans[session.type]);

  // ----- Loaders -----
  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedDate === todayISO()) {
        // The local calendar day has to travel with the request; the server must not
        // work it out from its own clock (see client/src/lib/today.ts).
        const r = await api.get<TodayResponse>("/workouts/today", { params: { date: selectedDate } });
        setSession(r.data.session);
        setSplitId(r.data.splitId);
        setHasChosenSplit(r.data.hasChosenSplit);
        if (r.data.stallNoticeSessions) setStallNoticeAt(r.data.stallNoticeSessions);
        if (r.data.stallDeloadSessions) setStallDeloadAt(r.data.stallDeloadSessions);
        // The cycle definitions live in the catalogue, so the next day is worked out
        // here from where the last session sat rather than on the server.
        setSuggested(nextDayInCycle(r.data.splitId, r.data.last));
        setNextCycleIndex(nextIndexInCycle(r.data.splitId, r.data.last));
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
        // Anything still owed to the server is newer than what the server just sent
        // back, so it is layered on top instead of being wiped by the reload.
        const owed = pendingFor(sessionId);
        if (owed.length === 0) return writeSets(r.data);
        const merged = [...r.data];
        for (const p of owed) {
          const i = merged.findIndex((row) => row.exerciseId === p.exerciseId && row.setNumber === p.setNumber);
          if (i === -1) merged.push({ sessionId, exerciseId: p.exerciseId, setNumber: p.setNumber, ...p.fields });
          else merged[i] = { ...merged[i], ...p.fields };
        }
        writeSets(merged);
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

  const loadExerciseNotes = useCallback(async () => {
    try {
      const r = await api.get<Record<string, string>>("/workouts/exercise-notes");
      setExerciseNotes(r.data);
    } catch {
      /* notes are a convenience */
    }
  }, []);

  const saveExerciseNote = useCallback(async (movementId: string, note: string) => {
    setExerciseNotes((m) => ({ ...m, [movementId]: note }));
    try {
      await api.put(`/workouts/exercise-notes/${movementId}`, { note });
    } catch (e) {
      toast.error(getApiError(e));
      void loadExerciseNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDayPlans = useCallback(async () => {
    try {
      const r = await api.get<Record<string, PlanSlot[]>>("/workouts/day-plans");
      setDayPlans(r.data);
    } catch {
      /* customisations are optional; defaults still render */
    }
  }, []);

  useEffect(() => {
    void loadDayPlans();
  }, [loadDayPlans]);

  useEffect(() => {
    void loadExerciseNotes();
  }, [loadExerciseNotes]);

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

  // A row only has a server _id once its write lands, which on a bad signal can be
  // minutes after it was typed.
  useEffect(() => {
    if (!sessionId) return;
    return onSetSynced((synced) => {
      if (!synced._id || synced.sessionId !== sessionId) return;
      writeSets(setsRef.current.map((row) => (row.exerciseId === synced.exerciseId && row.setNumber === synced.setNumber && !row._id ? { ...row, _id: synced._id } : row)));
    });
  }, [sessionId, writeSets]);

  // ----- Derived -----
  const exerciseIds = useMemo(() => new Set(exercises.map((e) => e.id)), [exercises]);
  /** "exerciseId|setNumber" for every row of this session not yet accepted by the server. */
  const pendingRows = useMemo(() => {
    const rows = new Set<string>();
    if (!sessionId) return rows;
    const prefix = `${sessionId}|`;
    for (const key of queue.keys) if (key.startsWith(prefix)) rows.add(key.slice(prefix.length));
    return rows;
  }, [queue.keys, sessionId]);
  const totalSets = useMemo(() => exercises.reduce((sum, e) => sum + e.sets, 0), [exercises]);
  const doneSets = useMemo(() => sets.filter((s) => s.done && exerciseIds.has(s.exerciseId)).length, [sets, exerciseIds]);
  const volume = useMemo(() => sets.reduce((sum, s) => (s.done && exerciseIds.has(s.exerciseId) ? sum + setVolume(s) : sum), 0), [sets, exerciseIds]);
  const percent = totalSets === 0 ? 0 : Math.round((doneSets / totalSets) * 100);

  const rest = useRestTimer();
  // The timer switch doubles as "I am at the gym", so it is what decides whether the
  // screen is held awake. Off, and nothing here touches the battery.
  useWakeLock(rest.enabled && !!session && !isCompleted && !isRestDay(session.type));

  // ----- Set mutations (optimistic) -----
  /**
   * The value stays where it was typed and is never rolled back. Sending it is the
   * queue's problem, and it keeps owing the server until the write lands, so a dead
   * spot in the gym cannot take a set back off the screen (see lib/setQueue.ts).
   */
  const saveSet = useCallback(
    (exerciseId: string, setNumber: number, patch: SetPatch) => {
      if (!session) return;
      const before = setsRef.current;
      const index = before.findIndex((s) => s.exerciseId === exerciseId && s.setNumber === setNumber);
      const optimistic: SetLog =
        index === -1 ? { sessionId: session._id, exerciseId, setNumber, weight: null, reps: null, rpe: null, done: false, ...patch } : { ...before[index], ...patch };

      writeSets(index === -1 ? [...before, optimistic] : before.map((s, i) => (i === index ? optimistic : s)));
      queueSet(session._id, exerciseId, setNumber, { weight: optimistic.weight, reps: optimistic.reps, rpe: optimistic.rpe, done: optimistic.done });
    },
    [session, writeSets],
  );

  const toggleSetDone = useCallback(
    (exerciseId: string, setNumber: number, nextDone: boolean) => {
      saveSet(exerciseId, setNumber, { done: nextDone });
      if (nextDone) rest.start();
    },
    [saveSet, rest],
  );

  // ----- Session actions -----
  const startSession = async (type: WorkoutType) => {
    try {
      const r = await api.post<Session>("/workouts/session", { date: selectedDate, type, splitId, cycleIndex: nextCycleIndex });
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
    if (queue.count > 0) toast(`${queue.count} ${queue.count === 1 ? "set is" : "sets are"} still saving. Keep the app open for a moment.`);
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
      forgetSession(session._id);
      setSession(null);
      writeSets([]);
      rest.stop();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  /**
   * After switching split, re-point today's session at the new split's first day.
   * Without this the existing session keeps its old day and the page renders the
   * previous programme's exercises no matter which split was picked.
   */
  const adoptSplit = useCallback(
    async (id: string) => {
      const cycle = getSplit(id).cycle;
      const current = session;
      if (!current || selectedDate !== todayISO()) {
        await loadSession();
        return;
      }
      // Already a day this split contains, and tagged with it: leave it alone.
      if (current.splitId === id && cycle.includes(current.type)) {
        await loadSession();
        return;
      }
      try {
        await api.patch(`/workouts/session/${current._id}`, { type: cycle[0], splitId: id, cycleIndex: 0 });
      } catch (e) {
        toast.error(getApiError(e));
      }
      forgetSession(current._id);
      writeSets([]);
      await loadSession();
    },
    [session, selectedDate, loadSession, writeSets],
  );

  const changeType = async (type: WorkoutType) => {
    if (!session) return;
    setPickerOpen(false);
    if (type === session.type) return;
    forgetSession(session._id);
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
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={rest.enabled ? "default" : "outline"}
            size="icon"
            className="h-9 w-9"
            aria-pressed={rest.enabled}
            aria-label={rest.enabled ? "Rest timer on. Turn it off" : "Rest timer off. Turn it on"}
            title={rest.enabled ? "Rest timer on: counts down between sets and keeps the screen awake" : "Rest timer off"}
            onClick={() => rest.setEnabled(!rest.enabled)}
          >
            {rest.enabled ? <Timer className="h-4 w-4" aria-hidden /> : <TimerOff className="h-4 w-4" aria-hidden />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {
              setRecapMounted(true);
              setRecapOpen(true);
            }}
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            History
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Change split" title={`Split: ${getSplit(splitId).name}`} onClick={() => setSplitPickerOpen(true)}>
            <Settings className="h-4 w-4" aria-hidden />
          </Button>
        </div>
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

      {queue.count > 0 && <UnsyncedBanner count={queue.count} syncing={queue.syncing} error={queue.lastError} />}

      {/* ===== Body ===== */}
      {!hasChosenSplit && !loading ? (
        <SplitIntro onOpen={() => setSplitPickerOpen(true)} />
      ) : loading ? (
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
          <SessionHero session={session} percent={percent} doneSets={doneSets} totalSets={totalSets} volume={volume} onChangeType={() => setPickerOpen(true)} onEditDay={() => setEditDayOpen(true)} isCustomised={isCustomised} />

          <h2 className="sr-only">Exercises</h2>
          <div className="grid gap-3">
            {exercises.map((exercise, i) => (
              <ExerciseCard
                key={exercise.id}
                index={i + 2}
                exercise={exercise}
                sets={sets.filter((s) => s.exerciseId === exercise.id)}
                last={lastWeights[exercise.id]}
                scheme={progressionFor(splitId)}
                noticeAt={stallNoticeAt}
                deloadAt={stallDeloadAt}
                readOnly={isCompleted}
                pendingRows={pendingRows}
                onSave={saveSet}
                onToggleDone={toggleSetDone}
                hasNote={!!exerciseNotes[exercise.id]}
                onOpenInfo={(suggested) => setInfoFor({ id: exercise.id, suggested })}
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
      <SplitPicker
        open={splitPickerOpen || (!hasChosenSplit && !loading)}
        currentId={splitId}
        mustChoose={!hasChosenSplit}
        noticeAt={stallNoticeAt}
        deloadAt={stallDeloadAt}
        onThresholds={(n, d) => {
          setStallNoticeAt(n);
          setStallDeloadAt(d);
        }}
        onOpenChange={setSplitPickerOpen}
        onChosen={(id) => {
          setSplitId(id);
          setHasChosenSplit(true);
          void adoptSplit(id);
        }}
      />

      {infoFor && (
        <ExerciseInfoModal
          movementId={infoFor.id}
          suggestedWeight={infoFor.suggested}
          note={exerciseNotes[infoFor.id] ?? ""}
          onNoteSaved={saveExerciseNote}
          onClose={() => setInfoFor(null)}
        />
      )}

      {session && !isRestDay(session.type) && (
        <EditDayDialog
          open={editDayOpen}
          onOpenChange={setEditDayOpen}
          dayKey={session.type}
          current={exercises}
          isCustomised={isCustomised}
          onSaved={loadDayPlans}
        />
      )}

      <WorkoutPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        suggested={suggested}
        currentType={session?.type ?? null}
        splitId={splitId}
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
              {formatDay(selectedDate)}, {session ? workoutLabel(session.type) : ""}. Every set logged for this day is removed. This cannot be undone.
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
// ExerciseInfoModal: what it works, how to do it, and your own note
// =====================================================================
const BAR_STORAGE_KEY = "workout:bar-kg";

function ExerciseInfoModal({
  movementId,
  suggestedWeight,
  onClose,
  note,
  onNoteSaved,
}: {
  movementId: string;
  suggestedWeight: number | null;
  onClose: () => void;
  note: string;
  onNoteSaved: (movementId: string, note: string) => void;
}) {
  const info = exerciseInfo(movementId);
  const [draft, setDraft] = useState(note);
  const [saved, setSaved] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const [bar, setBar] = useState(() => Number(localStorage.getItem(BAR_STORAGE_KEY) ?? 20));

  useEffect(() => setDraft(note), [note]);

  // Debounced autosave, matching the notes behaviour everywhere else.
  useEffect(() => {
    if (draft === note) return;
    const id = window.setTimeout(() => {
      onNoteSaved(movementId, draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    }, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const setBarKg = (kg: number) => {
    setBar(kg);
    localStorage.setItem(BAR_STORAGE_KEY, String(kg));
  };

  const load = suggestedWeight != null && suggestedWeight > 0 ? loadBar(suggestedWeight, bar) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[520px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{movementName(movementId)}</DialogTitle>
        </DialogHeader>

        {/* Anatomy illustration. Drop a PNG at public/exercises/<id>.png and it
            appears here; until then this is a labelled placeholder. */}
        <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
          {imgOk ? (
            <img src={exerciseImagePath(movementId)} alt={`Muscles worked by ${movementName(movementId)}`} onError={() => setImgOk(false)} className="h-full w-full object-contain" />
          ) : (
            <div className="px-6 text-center">
              <ImageIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
              <div className="text-xs font-medium text-muted-foreground">Illustration coming</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">public/exercises/{movementId}.png</div>
            </div>
          )}
        </div>

        {info && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {info.primary.map((m) => (
                <span key={m} className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                  {m}
                </span>
              ))}
              {info.secondary.map((m) => (
                <span key={m} className="rounded-full border border-border-strong px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {m}
                </span>
              ))}
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">How to do it</div>
              <ul className="space-y-1">
                {info.cues.map((c) => (
                  <li key={c} className="flex gap-2 text-sm text-muted-foreground">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Plate maths for the load the page is suggesting. */}
        {load && (
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Loading {formatKg(suggestedWeight!)}kg</span>
              <div className="flex gap-1">
                {BAR_OPTIONS.map((b) => (
                  <button
                    key={b.kg}
                    type="button"
                    onClick={() => setBarKg(b.kg)}
                    title={b.label}
                    className={`rounded-md border px-2 py-0.5 font-mono text-[10px] tabular-nums transition-colors ${b.kg === bar ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
                  >
                    {b.kg === 0 ? "none" : `${b.kg}kg`}
                  </button>
                ))}
              </div>
            </div>
            {bar === 0 ? (
              <p className="text-sm text-muted-foreground">Set the machine to {formatKg(suggestedWeight!)}kg.</p>
            ) : (
              <>
                <div className="font-mono text-lg font-semibold tabular-nums">{describeSide(load.perSide)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">per side, on a {bar}kg bar</div>
                {load.shortfall !== 0 && <div className="mt-1 text-[11px] text-muted-foreground">Closest loadable is {formatKg(load.achievable)}kg.</div>}
              </>
            )}
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your note</span>
            {saved && <span className="text-[10px] font-medium text-muted-foreground">Saved</span>}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label={`Your note about ${movementName(movementId)}`}
            placeholder="Seat height, grip, a niggle to watch…"
            className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}


// =====================================================================
// EditDayDialog: swap any exercise, change sets and reps, reset to default
// =====================================================================
const MOVEMENT_OPTIONS = [...ALL_MOVEMENT_IDS].map((id) => ({ id, name: movementName(id) })).sort((a, b) => a.name.localeCompare(b.name));

function EditDayDialog({
  open,
  onOpenChange,
  dayKey,
  current,
  isCustomised,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  dayKey: string;
  current: Exercise[];
  isCustomised: boolean;
  onSaved: () => void;
}) {
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSlots(current.map((e) => ({ id: e.id, sets: e.sets, reps: e.targetReps })));
  }, [open, current]);

  const used = new Set(slots.map((s) => s.id));
  const spare = MOVEMENT_OPTIONS.find((m) => !used.has(m.id));

  const update = (i: number, patch: Partial<PlanSlot>) => setSlots((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => setSlots((list) => list.filter((_, j) => j !== i));
  const add = () => spare && setSlots((list) => [...list, { id: spare.id, sets: 3, reps: 10 }]);
  const move = (i: number, by: number) =>
    setSlots((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    if (busy) return;
    if (slots.length === 0) return toast.error("A day needs at least one exercise");
    if (new Set(slots.map((s) => s.id)).size !== slots.length) return toast.error("The same exercise is listed twice");
    setBusy(true);
    try {
      await api.put(`/workouts/day-plans/${dayKey}`, { slots });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`/workouts/day-plans/${dayKey}`);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[640px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {workoutLabel(dayKey)}</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          Swap any exercise for another, change the sets and reps, or reorder them. This applies every time {workoutLabel(dayKey)} comes round.
          {isCustomised && " This day is currently customised."}
        </p>

        <div className="space-y-1.5">
          {slots.map((slot, i) => (
            <div key={`${slot.id}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-border p-1.5">
              <div className="flex shrink-0 flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="grid h-5 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ChevronUp className="h-3 w-3" aria-hidden />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label="Move down" className="grid h-5 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </button>
              </div>

              <Select value={slot.id} onValueChange={(v) => v && update(i, { id: v })}>
                <SelectTrigger className="!h-10 min-w-0 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_OPTIONS.map((m) => (
                    <SelectItem key={m.id} value={m.id} disabled={m.id !== slot.id && used.has(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input type="number" inputMode="numeric" min="1" max="20" value={slot.sets} onChange={(e) => update(i, { sets: Number(e.target.value) })} onFocus={(e) => e.currentTarget.select()} aria-label="Sets" className="h-10 w-14 text-center font-mono tabular-nums" />
              <span aria-hidden className="text-xs text-muted-foreground">×</span>
              <Input type="number" inputMode="numeric" min="1" max="500" value={slot.reps} onChange={(e) => update(i, { reps: Number(e.target.value) })} onFocus={(e) => e.currentTarget.select()} aria-label="Reps" className="h-10 w-16 text-center font-mono tabular-nums" />

              <button type="button" onClick={() => remove(i)} aria-label="Remove exercise" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={add} disabled={!spare} className="inline-flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
          <Plus className="h-3 w-3" aria-hidden />
          Add exercise
        </button>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" size="default" onClick={reset} disabled={busy || !isCustomised} title={isCustomised ? "Put this day back to the programme default" : "This day is already the default"}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Reset to default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="default" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="default" size="default" onClick={save} disabled={busy}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/** Shown behind the picker on first run, so the page is never just blank. */
function SplitIntro({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.div {...fadeUp}>
      <Card>
        <CardContent className="px-6 py-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Dumbbell className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="text-base font-semibold">Choose how you train</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Pick a split and the page lays out each day for you: exercises, sets and rep targets included. {SPLITS.length} to choose from, and you can switch any time.
          </p>
          <Button variant="default" size="default" className="mt-4" onClick={onOpen}>
            Browse splits
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}


// =====================================================================
// SplitPicker: first run, and any time the settings button is pressed
// =====================================================================
function SplitPicker({
  open,
  currentId,
  mustChoose,
  noticeAt,
  deloadAt,
  onOpenChange,
  onChosen,
  onThresholds,
}: {
  open: boolean;
  currentId: string;
  mustChoose: boolean;
  noticeAt: number;
  deloadAt: number;
  onOpenChange: (b: boolean) => void;
  onChosen: (id: string) => void;
  onThresholds: (notice: number, deload: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<string>("All");
  const [notice, setNotice] = useState(String(noticeAt));
  const [deload, setDeload] = useState(String(deloadAt));

  useEffect(() => {
    if (open) {
      setNotice(String(noticeAt));
      setDeload(String(deloadAt));
    }
  }, [open, noticeAt, deloadAt]);

  const commitThresholds = async () => {
    const n = Number(notice);
    const d = Number(deload);
    if (!Number.isInteger(n) || !Number.isInteger(d) || n < 2 || d < n) {
      setNotice(String(noticeAt));
      setDeload(String(deloadAt));
      return toast.error("Deload must be at least the notice threshold");
    }
    if (n === noticeAt && d === deloadAt) return;
    try {
      await api.patch("/workouts/settings", { stallNoticeSessions: n, stallDeloadSessions: d });
      onThresholds(n, d);
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const categories = useMemo(() => ["All", ...new Set(SPLITS.map((sp) => sp.category))], []);
  const visible = useMemo(() => (category === "All" ? SPLITS : SPLITS.filter((sp) => sp.category === category)), [category]);

  const choose = async (sp: Split) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.patch("/workouts/settings", { splitId: sp.id });
      onChosen(sp.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={mustChoose ? () => {} : onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[760px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mustChoose ? "Pick your split" : "Change split"}</DialogTitle>
        </DialogHeader>

        <p className="-mt-1 text-xs text-muted-foreground">
          {mustChoose ? "How your training week is laid out. You can change it any time from the settings button." : "Your logged history is kept. The new cycle starts from its first day."}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${c === category ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {visible.map((sp) => {
            const isCurrent = sp.id === currentId;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => void choose(sp)}
                disabled={saving}
                className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${isCurrent ? "border-foreground bg-muted/60" : "border-border hover:border-border-strong hover:bg-muted/40"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{sp.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{sp.summary}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums">{sp.daysPerWeek}d</span>
                </div>

                {/* The whole cycle at a glance, rest days included. */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {sp.cycle.map((key, i) => (
                    <span
                      key={`${sp.id}-${i}`}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isRestDay(key) ? "bg-muted text-muted-foreground" : "bg-foreground text-background"}`}
                    >
                      {isRestDay(key) ? "Rest" : workoutLabel(key)}
                    </span>
                  ))}
                </div>

                {isCurrent && <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current split</div>}
              </button>
            );
          })}
        </div>

        {/* Stall thresholds live here because they are programme settings, not
            per-session ones. Measured in sessions, so the right number depends on how
            often the split trains a given movement. */}
        {!mustChoose && (
          <div className="border-t border-border pt-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stall detection</div>
            <p className="mb-2 text-[11px] text-muted-foreground">Counted in sessions where nothing improved: no extra weight, no extra rep. Climbing a rep range never counts.</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                Notice after
                <Input type="number" inputMode="numeric" min="2" max="20" value={notice} onChange={(e) => setNotice(e.target.value)} onBlur={commitThresholds} onFocus={(e) => e.currentTarget.select()} aria-label="Sessions before a stall notice" className="h-9 w-16 text-center font-mono tabular-nums" />
              </label>
              <label className="flex items-center gap-2 text-xs">
                Suggest deload after
                <Input type="number" inputMode="numeric" min="2" max="20" value={deload} onChange={(e) => setDeload(e.target.value)} onBlur={commitThresholds} onFocus={(e) => e.currentTarget.select()} aria-label="Sessions before suggesting a deload" className="h-9 w-16 text-center font-mono tabular-nums" />
              </label>
            </div>
          </div>
        )}

        {!mustChoose && (
          <DialogFooter>
            <Button variant="outline" size="default" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}


// =====================================================================
// Shared bits
// =====================================================================
/**
 * Says out loud what the queue is holding. Without it, "the set is on my phone but
 * not on the server yet" is invisible, and invisible is how the old rollback lost
 * sets in the first place.
 */
function UnsyncedBanner({ count, syncing, error }: { count: number; syncing: boolean; error: string | null }) {
  return (
    <motion.div {...fadeUp} role="status" className="flex items-center gap-2.5 rounded-lg border border-border-strong px-3 py-2">
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">
          {count} {count === 1 ? "set is" : "sets are"} waiting to save
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">{error ?? "Kept on this phone and sent on their own once there is signal."}</p>
      </div>
      <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={syncing} onClick={() => void flushSets()}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
        {syncing ? "Saving" : "Retry"}
      </Button>
    </motion.div>
  );
}

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${className}`}>{children}</div>;
}

function WorkoutTypeBadge({ type }: { type: WorkoutType }) {
  const v = workoutTypeStyle(type);
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
  onEditDay,
  isCustomised,
}: {
  session: Session;
  percent: number;
  doneSets: number;
  totalSets: number;
  volume: number;
  onChangeType: () => void;
  onEditDay: () => void;
  isCustomised: boolean;
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
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Edit this day's exercises" title="Edit exercises" onClick={onEditDay}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="outline" size="icon" className="h-10 w-10 sm:w-auto sm:px-3" aria-label="Change workout type" onClick={onChangeType}>
                <RotateCcw className="h-4 w-4 sm:mr-1.5" aria-hidden />
                <span className="hidden text-sm sm:inline">Change</span>
              </Button>
            </div>
          </div>

          {isCustomised && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Pencil className="h-2.5 w-2.5" aria-hidden />
              Customised
            </div>
          )}

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
  scheme,
  noticeAt,
  deloadAt,
  index,
  readOnly,
  pendingRows,
  onSave,
  onToggleDone,
  hasNote,
  onOpenInfo,
}: {
  exercise: Exercise;
  sets: SetLog[];
  last: LastEntry | undefined;
  scheme: "linear" | "double" | "wave531" | "none";
  noticeAt: number;
  deloadAt: number;
  index: number;
  readOnly: boolean;
  /** "exerciseId|setNumber" of every row the server has not accepted yet. */
  pendingRows: Set<string>;
  onSave: (exerciseId: string, setNumber: number, patch: SetPatch) => void;
  onToggleDone: (exerciseId: string, setNumber: number, next: boolean) => void;
  hasNote: boolean;
  onOpenInfo: (suggestedWeight: number | null) => void;
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

  const e1rm = useMemo(() => {
    // Prefer today's own work once it exists, so the figure moves as you lift.
    const todayBest = sets.reduce((m, s) => Math.max(m, estimate1RM(s.weight ?? 0, s.reps ?? 0, s.rpe)), 0);
    return Math.round(Math.max(todayBest, last?.bestE1rm ?? 0) * 10) / 10;
  }, [sets, last]);

  const suggestion = useMemo(
    () => suggestLoad({ movementId: exercise.id, targetSets: exercise.sets, targetReps: exercise.targetReps, targetRepsMin: exercise.targetRepsMin, scheme, history: last }),
    [exercise, scheme, last],
  );

  const trend = useMemo(() => analyseTrend(last?.recent, noticeAt, deloadAt), [last, noticeAt, deloadAt]);


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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenInfo(suggestion?.weight ?? null);
                  }}
                  aria-label={`How to do ${exercise.name}`}
                  title="Form, muscles worked and your notes"
                  className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                  {hasNote && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden />}
                </button>
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
                {e1rm > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-mono tabular-nums" title="Estimated one-rep max, from your heaviest logged set">est. 1RM {formatKg(e1rm)}kg</span>
                  </>
                )}
              </div>

              {/* The number to aim for today, with the reasoning attached so it is
                  never a black box. */}
              {suggestion && (
                <div className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-muted px-2 py-1">
                  {suggestion.isIncrease ? <TrendingUp className="h-3 w-3 shrink-0" aria-hidden /> : <Minus className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="font-mono text-[11px] font-semibold tabular-nums">
                    Today {formatKg(trend.status === "deload" && trend.deloadTo ? trend.deloadTo : suggestion.weight)}kg × {suggestion.reps}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{trend.status === "deload" ? "deload" : suggestion.reason}</span>
                </div>
              )}

              {/* Only speaks up when it has something to say: a stall worth noticing,
                  a deload worth taking, or ground actually lost. */}
              {(trend.status === "notice" || trend.status === "deload" || trend.status === "regressed") && (
                <div className={`mt-1.5 flex items-start gap-1.5 rounded-lg px-2 py-1 ${trend.status === "deload" ? "bg-foreground text-background" : "border border-border-strong"}`}>
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span className="text-[10px] leading-snug">{trend.message}</span>
                </div>
              )}
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
                    <SetRow
                      key={setNumber}
                      exercise={exercise}
                      setNumber={setNumber}
                      log={byNumber.get(setNumber)}
                      last={last}
                      readOnly={readOnly}
                      pending={pendingRows.has(`${exercise.id}|${setNumber}`)}
                      onSave={onSave}
                      onToggleDone={onToggleDone}
                    />
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
// Set row: weight and reps are both entered
// =====================================================================
function SetRow({
  exercise,
  setNumber,
  log,
  last,
  readOnly,
  pending,
  onSave,
  onToggleDone,
}: {
  exercise: Exercise;
  setNumber: number;
  log: SetLog | undefined;
  last: LastEntry | undefined;
  readOnly: boolean;
  pending: boolean;
  onSave: (exerciseId: string, setNumber: number, patch: SetPatch) => void;
  onToggleDone: (exerciseId: string, setNumber: number, next: boolean) => void;
}) {
  const serverWeight = log?.weight != null ? formatKg(log.weight) : "";
  const serverReps = log?.reps != null ? String(log.reps) : "";
  const serverRpe = log?.rpe != null ? String(log.rpe) : "";
  const isDone = log?.done ?? false;

  const [weight, setWeight] = useState(serverWeight);
  const [reps, setReps] = useState(serverReps);
  const [rpe, setRpe] = useState(serverRpe);

  // Resync when the stored values themselves change, not just when the number of
  // rows does. Editing a value used to leave the input showing stale text.
  useEffect(() => setWeight(serverWeight), [serverWeight]);
  useEffect(() => setReps(serverReps), [serverReps]);
  useEffect(() => setRpe(serverRpe), [serverRpe]);

  const weightId = `w-${exercise.id}-${setNumber}`;
  const repsId = `r-${exercise.id}-${setNumber}`;
  const rpeId = `e-${exercise.id}-${setNumber}`;
  const checkId = `c-${exercise.id}-${setNumber}`;

  const commit = (field: "weight" | "reps" | "rpe", raw: string) => {
    const parsed = parseNumeric(raw);
    const invalid = parsed === undefined || (field === "rpe" && parsed !== null && (parsed < 1 || parsed > 10));
    if (invalid) {
      // Invalid entry: snap back to what is stored rather than saving garbage.
      if (field === "weight") setWeight(serverWeight);
      else if (field === "reps") setReps(serverReps);
      else setRpe(serverRpe);
      return;
    }
    const current = field === "weight" ? (log?.weight ?? null) : field === "reps" ? (log?.reps ?? null) : (log?.rpe ?? null);
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
          placeholder={String(exercise.targetRepsMin)}
        />
        {/* Optional. Left blank it changes nothing; filled in it sharpens the 1RM
            estimate, because RPE says how many reps were still in the tank. */}
        <NumberField
          id={rpeId}
          value={rpe}
          onChange={setRpe}
          onCommit={(v) => commit("rpe", v)}
          onEnter={() => advanceFrom("reps")}
          suffix="rpe"
          step="0.5"
          disabled={readOnly}
          ariaLabel={`Effort for ${rowLabel}, 1 to 10`}
          placeholder="–"
          className="relative hidden w-20 shrink-0 sm:block"
        />
      </div>

      {/* A held width, so a row does not jump sideways the moment it saves. */}
      <span className="flex w-3 shrink-0 justify-center">
        {pending && <span className="h-1.5 w-1.5 rounded-full border border-foreground" role="img" aria-label={`${rowLabel} not saved yet`} title="Not saved yet" />}
      </span>
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
  className,
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
  className?: string;
}) {
  return (
    <div className={className ?? "relative flex-1"}>
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
 * Holds only state that changes on user action, never the per-tick clock. The
 * countdown itself ticks inside RestTimerBar, so a running timer does not re-render
 * the whole page (and every set row in it) four times a second.
 */
function useRestTimer() {
  // Off is a perfectly reasonable way to train, so the whole feature is a switch.
  // Persisted per device: it is a preference about this phone, not about the plan.
  const [enabled, setEnabled] = useState(() => localStorage.getItem(REST_ENABLED_KEY) !== "0");
  const [duration, setDuration] = useState(() => {
    const stored = Number(localStorage.getItem(REST_STORAGE_KEY));
    return REST_PRESETS.includes(stored) ? stored : 90;
  });
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [paused, setPaused] = useState<number | null>(null); // seconds left while paused

  const running = enabled && (endsAt !== null || paused !== null);

  const start = useCallback(() => {
    if (!enabled) return;
    // Audio can only be created from a user gesture, and the tap that ticked the set
    // off is the one that got us here.
    primeBeep();
    setPaused(null);
    setEndsAt(Date.now() + duration * 1000);
  }, [enabled, duration]);

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

  const changeEnabled = useCallback((on: boolean) => {
    setEnabled(on);
    localStorage.setItem(REST_ENABLED_KEY, on ? "1" : "0");
    if (on) primeBeep();
    else {
      setEndsAt(null);
      setPaused(null);
    }
  }, []);

  return useMemo(
    () => ({ enabled, setEnabled: changeEnabled, duration, changeDuration, endsAt, pausedAt: paused, running, start, stop, toggle, adjust }),
    [enabled, changeEnabled, duration, changeDuration, endsAt, paused, running, start, stop, toggle, adjust],
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
      restOverAlert();
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
  splitId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  suggested: WorkoutType;
  currentType: WorkoutType | null;
  splitId: string;
  onPick: (type: WorkoutType) => void;
}) {
  // The days this split actually contains, in cycle order, plus rest.
  const options: WorkoutType[] = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const key of getSplit(splitId).cycle) {
      if (isRestDay(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    out.push(REST);
    return out;
  }, [splitId]);

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
                    <div className="text-[11px] text-muted-foreground">{isRestDay(type) ? "No training" : `${exerciseCount(type)} exercises`}</div>
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
