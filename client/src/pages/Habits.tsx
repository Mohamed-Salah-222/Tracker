import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { CheckCheck, ChevronLeft, ChevronRight, MessageSquarePlus, LayoutDashboard, Plus, Settings2, SkipForward } from "lucide-react";
import HabitManager, { HabitForm } from "../components/HabitManager";
import { HabitGlyph } from "../components/HabitGlyph";
import { Input } from "../components/ui/input";
import { getApiError, dayLabel, shiftDay } from "../lib/food";

type HabitState = "done" | "excused" | null;

type HabitItem = {
  kind: string;
  label: string;
  description: string;
  icon: string;
  /** "count" habits record a number; the rest are a simple tick. */
  input: "check" | "count";
  /** What the number is called: "steps", "pages", "times". */
  unit?: string;
  amount: number | null;
  target: number | null;
  state: HabitState;
  checked: boolean;
  note: string;
  /** Where this habit stands in the month the shown day belongs to. */
  monthDone: number;
  monthTarget: number;
};

type HabitsDay = {
  date: string;
  done: number;
  skipped: number;
  total: number;
  items: HabitItem[];
};

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: Math.min(i, 7) * 0.03 },
});

// =====================================================================
// MAIN
// =====================================================================
export default function Habits() {
  const [date, setDate] = useState(todayISO);
  const [day, setDay] = useState<HabitsDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [creatingHabit, setCreatingHabit] = useState(false);

  const dayRef = useRef<HabitsDay | null>(null);
  const writeDay = useCallback((next: HabitsDay) => {
    dayRef.current = next;
    setDay(next);
  }, []);

  const isToday = date === todayISO();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<HabitsDay>("/dashboard/habits", { params: { date } });
      writeDay(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [date, writeDay]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Recomputes the counters locally so the header does not lag the tick. */
  const withItems = (items: HabitItem[]): HabitsDay => ({
    date,
    items,
    total: items.length,
    done: items.filter((i) => i.state === "done").length,
    skipped: items.filter((i) => i.state === "excused").length,
  });

  const save = async (item: HabitItem, patch: { state?: HabitState; note?: string; amount?: number }) => {
    const current = dayRef.current;
    if (!current) return;
    const nextAmount = patch.amount !== undefined ? patch.amount : item.amount;
    const nextNote = patch.note !== undefined ? patch.note : item.note;
    // A counted habit is done once it reaches its target, so the state follows the
    // number rather than being set by hand.
    const nextState =
      patch.state !== undefined
        ? patch.state
        : item.input === "count" && patch.amount !== undefined
          ? item.state === "excused"
            ? "excused"
            : (nextAmount ?? 0) >= (item.target ?? 0) && (item.target ?? 0) > 0
              ? "done"
              : null
          : item.state;

    writeDay(withItems(current.items.map((i) => (i.kind === item.kind ? { ...i, state: nextState, checked: nextState !== null, note: nextNote, amount: nextAmount } : i))));

    try {
      await api.put(`/dashboard/tracker/${item.kind}/${date}`, {
        checked: nextState === "done" || nextState === "excused",
        state: nextState,
        ...(item.input === "count" ? { amount: nextAmount ?? 0 } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      });
    } catch (e) {
      toast.error(getApiError(e));
      writeDay(current);
    }
  };

  const items = day?.items ?? [];
  const done = day?.done ?? 0;
  const skipped = day?.skipped ?? 0;
  const total = day?.total ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="w-full max-w-[720px] space-y-4">
      {/* ===== Header ===== */}
      <motion.header {...fadeUp} className="flex items-center justify-between gap-3">
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <CheckCheck className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Habits</h1>
        </div>
        <h1 className="sr-only md:hidden">Habits</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="default" size="sm" className="h-9" onClick={() => setCreatingHabit(true)}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            New habit
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Manage habits" title="Reorder, edit or retire your habits" onClick={() => setManageOpen(true)}>
            <Settings2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </motion.header>

      {/* ===== Date nav ===== */}
      <motion.nav {...fadeUp} aria-label="Select day" className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <button
          type="button"
          onClick={() => setDate(todayISO())}
          disabled={isToday}
          aria-label={isToday ? "Showing today" : `Showing ${dayLabel(date)}. Jump to today`}
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-transparent px-2 text-sm font-medium transition-colors enabled:hover:border-border enabled:hover:bg-muted/60 disabled:cursor-default"
        >
          <span className="truncate">{dayLabel(date)}</span>
          {isToday ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today</span>
          ) : (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Jump to today</span>
          )}
        </button>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </motion.nav>

      {/* ===== Summary ===== */}
      <motion.section {...stagger(1)} aria-label="Day summary">
        <Card>
          <CardContent className="px-4 py-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Habits</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight">{done}</span>
                  <span className="font-mono text-sm text-muted-foreground">/ {total} done</span>
                </div>
                {skipped > 0 && <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{skipped} skipped on purpose</div>}
              </div>
              <Link to="/" className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
                See the month
              </Link>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="h-full rounded-full bg-foreground" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ===== List ===== */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading habits">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <motion.div {...stagger(2)}>
          <Card>
            <CardContent className="px-6 py-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
                <CheckCheck className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="text-base font-semibold">Nothing to tick yet</div>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Add the things you want to do most days. Tick them off, or record a number if that suits it better, and the month fills in on the dashboard.
              </p>
              <Button variant="default" size="default" className="mt-4" onClick={() => setCreatingHabit(true)}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden />
                Add your first habit
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <HabitCard key={item.kind} item={item} index={i + 2} onSave={save} />
          ))}
        </div>
      )}

      <p className="pt-1 text-center text-xs text-muted-foreground">Every tick here is the same one on the dashboard grid.</p>

      <HabitManager open={manageOpen} onOpenChange={setManageOpen} onChanged={load} />
      {creatingHabit && (
        <HabitForm
          habit={null}
          onClose={() => setCreatingHabit(false)}
          onSaved={() => {
            setCreatingHabit(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// HabitCard
// =====================================================================
function HabitCard({ item, index, onSave }: { item: HabitItem; index: number; onSave: (item: HabitItem, patch: { state?: HabitState; note?: string; amount?: number }) => void }) {

  const [note, setNote] = useState(item.note);
  const [noteOpen, setNoteOpen] = useState(item.note.length > 0);
  const [saved, setSaved] = useState(false);
  const isCount = item.input === "count";
  // A step of 100 suits 10,000 steps and is absurd for 15 minutes, so it scales with
  // the target rather than staying fixed to the one habit that used to be countable.
  const countStep = (() => {
    const target = item.target ?? 0;
    if (target >= 5000) return 500;
    if (target >= 500) return 50;
    if (target >= 50) return 5;
    return 1;
  })();
  const [amount, setAmount] = useState(item.amount != null && item.amount > 0 ? String(item.amount) : "");

  useEffect(() => {
    setAmount(item.amount != null && item.amount > 0 ? String(item.amount) : "");
  }, [item.amount]);

  const commitAmount = (raw: string) => {
    const n = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setAmount(item.amount != null && item.amount > 0 ? String(item.amount) : "");
      return;
    }
    if (n === (item.amount ?? 0)) return;
    onSave(item, { amount: n });
  };

  useEffect(() => {
    setNote(item.note);
    if (item.note.length > 0) setNoteOpen(true);
  }, [item.note]);

  // Debounced autosave, matching the notes behaviour on the workout page.
  useEffect(() => {
    if (note === item.note) return;
    const id = window.setTimeout(() => {
      onSave(item, { note });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    }, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const isDone = item.state === "done";
  const isSkipped = item.state === "excused";

  const toggleDone = () => onSave(item, { state: isDone ? null : "done" });
  const toggleSkip = () => onSave(item, { state: isSkipped ? null : "excused" });

  return (
    <motion.section {...stagger(index)} aria-label={item.label}>
      <Card style={isDone ? { boxShadow: "inset 3px 0 0 0 var(--color-foreground)" } : undefined}>
        <CardContent className="px-3 py-0 sm:px-4">
          <div className="flex items-center gap-2">
            {isCount ? (
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${isDone ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`} aria-hidden>
                <HabitGlyph name={item.icon} className="h-4 w-4" />
              </span>
            ) : (
              <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted">
                <Checkbox checked={isDone} aria-label={`Mark ${item.label} ${isDone ? "not done" : "done"}`} onCheckedChange={toggleDone} />
              </label>
            )}

            {isCount ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${isSkipped ? "text-muted-foreground line-through" : ""}`}>{item.label}</span>
                  <span className="block truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                    of {(item.target ?? 0).toLocaleString("en-US")}
                    {item.unit ? ` ${item.unit}` : ""}
                    {" · "}
                    {item.monthDone}/{item.monthTarget} this month
                  </span>
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step={countStep}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={(e) => commitAmount(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  placeholder="0"
                  aria-label={`${item.label} today`}
                  className="ml-auto h-11 w-28 text-right font-mono tabular-nums"
                />
              </div>
            ) : (
              <button type="button" onClick={toggleDone} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <HabitGlyph name={item.icon} className={`h-4 w-4 shrink-0 ${isDone ? "text-foreground" : "text-muted-foreground"}`} />
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${isSkipped ? "text-muted-foreground line-through" : ""}`}>{item.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {isSkipped ? "Skipped on purpose" : item.description}
                    {item.description && !isSkipped ? " · " : ""}
                    {!isSkipped && <span className="font-mono tabular-nums">{item.monthDone}/{item.monthTarget} this month</span>}
                  </span>
                </span>
              </button>
            )}

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={toggleSkip}
                aria-pressed={isSkipped}
                aria-label={`${isSkipped ? "Un-skip" : "Skip"} ${item.label}`}
                title={isSkipped ? "Un-skip" : "Skip this one today"}
                className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${isSkipped ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <SkipForward className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setNoteOpen((o) => !o)}
                aria-expanded={noteOpen}
                aria-label={`${noteOpen ? "Hide" : "Add"} a note for ${item.label}`}
                title="Note"
                className={`relative grid h-9 w-9 place-items-center rounded-md transition-colors ${noteOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
                {!noteOpen && item.note.length > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden />}
              </button>
            </div>
          </div>

          {noteOpen && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note</span>
                {saved && <span className="text-[10px] font-medium text-muted-foreground">Saved</span>}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                aria-label={`Note for ${item.label}`}
                placeholder="What happened, or why you skipped it…"
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.section>
  );
}
