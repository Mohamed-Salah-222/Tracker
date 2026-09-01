import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { LineSeries, type LinePoint } from "../components/MiniChart";
import { HORIZON_LABEL, cadenceLabel, dayLabel, daysBetween, goalError, listGoals, remainingLabel, type Checkpoint, type Goal } from "../lib/goals";
import GoalForm from "../components/GoalForm";
import GoalTimeline from "../components/GoalTimeline";
import CheckpointForm from "../components/CheckpointForm";

const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } };

// =====================================================================
// GoalPage
//
// A goal gets a page rather than a dialog: the timeline is the substance of it and
// wants the whole width, and a page can be linked to, reloaded and navigated back
// from, which a modal cannot.
// =====================================================================
export default function GoalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const today = todayISO();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [rows, setRows] = useState<Checkpoint[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [all, cps] = await Promise.all([listGoals(today, { status: "all" }), api.get<Checkpoint[]>(`/goals/${id}/checkpoints`)]);
      const found = all.goals.find((g) => g._id === id) ?? null;
      setGoal(found);
      setMissing(!found);
      setRows(cps.data);
    } catch (e) {
      toast.error(goalError(e));
      setMissing(true);
    }
  }, [id, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (status: "active" | "done") => {
    if (!goal) return;
    try {
      await api.patch(`/goals/${goal._id}`, { status, today });
      toast.success(status === "done" ? "Marked done" : "Back to active");
      await load();
    } catch (e) {
      toast.error(goalError(e));
    }
  };

  const remove = async () => {
    if (!goal) return;
    setPendingDelete(false);
    try {
      const r = await api.delete<{ checkpointsRemoved: number }>(`/goals/${goal._id}`);
      toast.success(r.data.checkpointsRemoved > 0 ? `Deleted, along with ${r.data.checkpointsRemoved} entries` : "Deleted");
      navigate("/goals");
    } catch (e) {
      toast.error(goalError(e));
    }
  };

  if (missing) {
    return (
      <div className="w-full max-w-[900px] space-y-4">
        <BackLink />
        <Card>
          <CardContent className="px-6 py-8 text-center">
            <div className="text-base font-semibold">That goal is not here</div>
            <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="w-full max-w-[900px] space-y-4" aria-busy="true">
        <BackLink />
        <Skeleton className="h-[150px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    );
  }

  const done = goal.status === "done";
  const withValues = (rows ?? []).filter((r) => r.value !== null);
  const points: LinePoint[] = withValues
    .slice()
    .reverse()
    .map((r) => ({ key: r._id, label: dayLabel(r.date).slice(0, 6), value: r.value as number, tooltip: [dayLabel(r.date), `${r.value}${goal.measure?.unit ? " " + goal.measure.unit : ""}`] }));

  const firstAt = rows && rows.length > 0 ? rows[rows.length - 1].date : null;
  const cadence = cadenceLabel(goal.checkpointCount, firstAt, today);
  const running = firstAt ? daysBetween(firstAt, today) : null;

  return (
    <div className="w-full max-w-[900px] space-y-4">
      <BackLink />

      {/* ===== The goal itself ===== */}
      <motion.section {...fadeUp} aria-label="Goal">
        <Card>
          <CardContent className="px-4 py-0 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border-strong px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{HORIZON_LABEL[goal.horizon]}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{goal.periodLabel}</span>
                  {goal.daysUntilStart !== null && !done ? (
                    <span className="rounded-full border border-foreground px-1.5 py-px text-[9px] font-bold uppercase tracking-wider">starts in {goal.daysUntilStart} days</span>
                  ) : (
                    goal.daysLeft !== null &&
                    !done && (
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        · {goal.daysLeft < 0 ? "period over" : goal.daysLeft === 0 ? "last day" : `${goal.daysLeft} days left`}
                      </span>
                    )
                  )}
                  {goal.targetDate && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">· by {dayLabel(goal.targetDate)}</span>}
                </div>
                <h1 className={`mt-1 text-2xl font-semibold tracking-tight sm:text-3xl ${done ? "line-through" : ""}`}>{goal.title}</h1>
                {goal.why && <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">{goal.why}</p>}
              </div>

              {goal.measure && goal.percent !== null && (
                <div className="shrink-0 text-right">
                  <div className="font-mono text-3xl font-semibold tabular-nums leading-none">
                    {goal.current}
                    {goal.measure.unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{goal.measure.unit}</span>}
                  </div>
                  <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">{remainingLabel(goal)}</div>
                </div>
              )}
            </div>

            {goal.measure && goal.percent !== null && (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${goal.percent}%` }} />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
                  <span>
                    started at {goal.measure.startValue}
                    {goal.measure.unit}
                  </span>
                  <span className="font-semibold text-foreground">{goal.percent}%</span>
                  <span>
                    target {goal.measure.targetValue}
                    {goal.measure.unit}
                  </span>
                </div>
              </div>
            )}

            {/* Facts that suit whatever kind of goal this is. */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>
                {goal.checkpointCount} {goal.checkpointCount === 1 ? "checkpoint" : "checkpoints"}
              </span>
              {running !== null && <span>running {running} days</span>}
              {cadence && <span>{cadence}</span>}
              {goal.lastCheckpointAt && <span>last {goal.quietDays === 0 ? "today" : `${goal.quietDays} days ago`}</span>}
              {done && goal.completedAt && <span>finished {dayLabel(goal.completedAt)}</span>}
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {points.length >= 2 && (
        <motion.section {...fadeUp} aria-label="Progress over time">
          <Card>
            <CardContent className="px-4 py-0 sm:px-5">
              <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">How the number moved</h2>
              <LineSeries points={points} height={150} emptyLabel="Log a couple of numbers to see the shape." />
            </CardContent>
          </Card>
        </motion.section>
      )}

      <motion.div {...fadeUp} className="flex flex-wrap gap-2">
        <Button variant="default" size="sm" className="h-9" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          Add a checkpoint
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Edit goal
        </Button>
        {done ? (
          <Button variant="outline" size="sm" className="h-9" onClick={() => void setStatus("active")}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Reopen
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-9" onClick={() => void setStatus("done")}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Mark done
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto h-9 text-muted-foreground" onClick={() => setPendingDelete(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Delete
        </Button>
      </motion.div>

      <GoalTimeline goalId={goal._id} rows={rows} unit={goal.measure?.unit ?? ""} onChanged={load} />

      {adding && <CheckpointForm goal={goal} today={today} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}
      {editing && <GoalForm goal={goal} horizon={goal.horizon} today={today} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />}

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{goal.title}”?</AlertDialogTitle>
            <AlertDialogDescription>Its whole timeline goes with it. Marking it done keeps the record instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/goals" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      All goals
    </Link>
  );
}
