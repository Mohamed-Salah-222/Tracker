import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Plus, Target } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { goalPercent, goals } from "../lib/goals";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

const PROGRESS_GREEN = "#16a34a";

function formatMoneyTarget(currency: string, value: number) {
  return currency === "$" ? `$${value.toLocaleString("en-US")}` : `${value.toLocaleString("en-US")} ${currency}`;
}

export default function Goals() {
  const overall = goals.length ? Math.round(goals.reduce((sum, goal) => sum + goalPercent(goal), 0) / goals.length) : 0;
  const projectGoals = goals.filter((goal) => goal.kind === "project").length;

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5">
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">Goals</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Long game board</h1>
        </div>
        <Button className="self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          New Goal
        </Button>
      </motion.div>

      <motion.div {...stagger(1)} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Overall Progress" value={`${overall}%`} />
        <SummaryCard label="Project Goals" value={String(projectGoals)} />
        <SummaryCard label="Active Goals" value={String(goals.length)} />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {goals.map((goal, index) => {
          const percent = goalPercent(goal);
          const Icon = goal.icon;
          return (
            <motion.div key={goal.id} {...stagger(index + 2)}>
              <Link to={`/goals/${goal.id}`} className="block h-full">
                <Card className="h-full border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <CardContent className="p-4 h-full flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center border border-neutral-200 bg-neutral-950 text-white shadow-sm">
                          <Icon className="h-5 w-5" strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-base font-semibold tracking-tight truncate">{goal.title}</h2>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{goal.subtitle}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>

                    <div className="mt-auto space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-muted-foreground">Progress</span>
                        <span className="font-mono font-semibold tabular-nums">{percent}%</span>
                      </div>
                      <ProgressBar percent={percent} />
                    </div>

                    <GoalMeta goalId={goal.id} />
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
            <div className="text-2xl font-semibold tracking-tight mt-1 font-mono tabular-nums">{value}</div>
          </div>
          <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
            <Target className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalMeta({ goalId }: { goalId: string }) {
  const goal = goals.find((item) => item.id === goalId);
  if (!goal) return null;
  if (goal.kind === "project") {
    const total = goal.tasks?.length ?? 0;
    const done = goal.tasks?.filter((task) => task.status === "completed" || task.done).length ?? 0;
    const threads = goal.tasks?.reduce((sum, task) => sum + task.threadCount, 0) ?? 0;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {done}/{total} tickets
        </span>
        <span className="font-medium">{threads} mini threads</span>
      </div>
    );
  }
  if (goal.kind === "money" && goal.money) {
    return <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Target: {formatMoneyTarget(goal.money.currency, goal.money.target)}</div>;
  }
  if (goal.kind === "weight" && goal.weight) {
    const weightTarget = goal.weight.targetMin && goal.weight.targetMax ? `${goal.weight.targetMin}-${goal.weight.targetMax} ${goal.weight.unit}` : `${goal.weight.target} ${goal.weight.unit}`;
    const fatTarget = goal.weight.targetFatMin && goal.weight.targetFatMax ? ` / ${goal.weight.targetFatMin}-${goal.weight.targetFatMax}% fat` : "";
    return <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Target: {weightTarget}{fatTarget}</div>;
  }
  return null;
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 rounded-full overflow-hidden bg-muted">
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(percent, 100)}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ backgroundColor: PROGRESS_GREEN }} />
    </div>
  );
}
