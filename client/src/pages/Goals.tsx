import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "react-router-dom";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle2, Plus, Search, Target, TriangleAlert } from "lucide-react";
import { HORIZON_LABEL, goalError, isQuiet, listGoals, remainingLabel, type Goal, type GoalsResponse, type Horizon } from "../lib/goals";
import GoalForm from "../components/GoalForm";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({ ...fadeUp, transition: { ...fadeUp.transition, delay: Math.min(i, 8) * 0.03 } });

type Filter = "all" | Horizon | "done";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "lifetime", label: "Open" },
  { key: "monthly", label: "Monthly" },
  { key: "weekly", label: "Weekly" },
  { key: "custom", label: "Dated" },
  { key: "done", label: "Done" },
];

// =====================================================================
// Goals
//
// One list, not three sections. The horizon is a property of a goal, not a place it
// lives, so it reads as a badge and drives an optional filter instead of splitting
// the page into buckets that are mostly empty.
// =====================================================================
export default function Goals() {
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const today = todayISO();

  const load = useCallback(async () => {
    try {
      setData(await listGoals(today, { status: "all" }));
    } catch (e) {
      toast.error(goalError(e));
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => data?.goals.filter((g) => g.status !== "archived") ?? [], [data]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((g) => (filter === "done" ? g.status === "done" : filter === "all" ? g.status !== "done" : g.horizon === filter && g.status !== "done"))
      .filter((g) => !term || g.title.toLowerCase().includes(term) || g.why.toLowerCase().includes(term))
      .sort((a, b) => Number(isQuiet(a)) - Number(isQuiet(b)) || (a.quietDays ?? 9999) - (b.quietDays ?? 9999));
  }, [all, filter, search]);

  const counts = useMemo(() => {
    const map: Record<Filter, number> = { all: 0, lifetime: 0, monthly: 0, weekly: 0, custom: 0, done: 0 };
    for (const g of all) {
      if (g.status === "done") map.done++;
      else {
        map.all++;
        map[g.horizon]++;
      }
    }
    return map;
  }, [all]);

  const quiet = all.filter((g) => g.status === "active" && isQuiet(g));

  return (
    <div className="w-full max-w-[1000px] space-y-4">
      <motion.header {...fadeUp} className="flex items-center justify-between gap-3">
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <Target className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Goals</h1>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{counts.all} open</span>
        </div>
        <h1 className="sr-only md:hidden">Goals</h1>
        <Button variant="default" size="sm" className="ml-auto h-9" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          New goal
        </Button>
      </motion.header>

      <motion.div {...stagger(1)} className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a goal" aria-label="Find a goal" className="h-9 pl-8" />
        </div>
        {FILTERS.filter((f) => f.key === "all" || f.key === filter || counts[f.key] > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              filter === f.key ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
            <span className="font-mono tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </motion.div>

      {quiet.length > 0 && filter !== "done" && (
        <motion.div {...stagger(2)} className="flex flex-wrap items-center gap-2 rounded-xl border border-border-strong px-3 py-2">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gone quiet</span>
          {quiet.slice(0, 5).map((g) => (
            <Link key={g._id} to={`/goals/${g._id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted">
              {g.title}
              <span className="font-mono tabular-nums text-muted-foreground">{g.quietDays === null ? "no entries" : `${g.quietDays}d`}</span>
            </Link>
          ))}
        </motion.div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[136px] rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState hasAny={all.length > 0} onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {shown.map((goal, i) => (
              <GoalCard key={goal._id} goal={goal} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {creating && <GoalForm goal={null} horizon="lifetime" today={today} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
    </div>
  );
}

function EmptyState({ hasAny, onCreate }: { hasAny: boolean; onCreate: () => void }) {
  return (
    <motion.div {...stagger(3)}>
      <Card>
        <CardContent className="px-6 py-7 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Target className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="text-base font-semibold">{hasAny ? "Nothing matches" : "No goals yet"}</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {hasAny
              ? "Try another filter, or clear the search."
              : "A goal can be open ended, tied to a month or a week, and can track a number if that suits it. Add checkpoints as you go and each one builds its own timeline."}
          </p>
          {!hasAny && (
            <Button variant="default" size="default" className="mt-4" onClick={onCreate}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden />
              Add your first goal
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// =====================================================================
// GoalCard
// =====================================================================
function GoalCard({ goal, index }: { goal: Goal; index: number }) {
  const done = goal.status === "done";
  const quiet = isQuiet(goal);

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.02 }}>
      <Link
        to={`/goals/${goal._id}`}
        className={`group flex h-full flex-col rounded-xl border bg-card p-3.5 transition-all hover:border-foreground hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] ${
          done ? "border-dashed border-border-strong opacity-70" : "border-border"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`min-w-0 flex-1 text-sm font-semibold leading-snug ${done ? "line-through" : ""}`}>{goal.title}</span>
          <span className="shrink-0 rounded-full border border-border-strong px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{HORIZON_LABEL[goal.horizon]}</span>
        </div>

        {goal.why && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{goal.why}</p>}

        {goal.measure && goal.percent !== null ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-lg font-semibold tabular-nums leading-none">
                {goal.current}
                {goal.measure.unit && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{goal.measure.unit}</span>}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{remainingLabel(goal)}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${goal.percent}%` }} />
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-end gap-1" aria-hidden>
            {/* A few stubs standing in for the trail, so an untracked goal is not a blank. */}
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i < Math.min(goal.checkpointCount, 7) ? "var(--color-foreground)" : "var(--color-muted)" }} />
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-3 font-mono text-[10px] tabular-nums text-muted-foreground">
          {goal.horizon !== "lifetime" && (
            <>
              <span className="font-sans font-medium text-foreground">{goal.periodLabel}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>
            {goal.checkpointCount} {goal.checkpointCount === 1 ? "entry" : "entries"}
          </span>
          {goal.lastCheckpointAt && (
            <>
              <span aria-hidden>·</span>
              <span>{goal.quietDays === 0 ? "today" : `${goal.quietDays}d ago`}</span>
            </>
          )}
          {goal.daysUntilStart !== null && !done ? (
            <>
              <span aria-hidden>·</span>
              <span>starts in {goal.daysUntilStart}d</span>
            </>
          ) : (
            goal.daysLeft !== null &&
            !done && (
              <>
                <span aria-hidden>·</span>
                <span>{goal.daysLeft < 0 ? "period over" : goal.daysLeft === 0 ? "last day" : `${goal.daysLeft}d left`}</span>
              </>
            )
          )}
          {done && (
            <span className="ml-auto inline-flex items-center gap-1 font-sans font-semibold uppercase tracking-wide">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              done
            </span>
          )}
          {quiet && !done && <span className="ml-auto font-sans font-semibold uppercase tracking-wide">quiet</span>}
        </div>
      </Link>
    </motion.div>
  );
}
