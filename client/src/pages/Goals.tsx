import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { ArrowRight, CheckCircle2, Plus, Target } from "lucide-react";
import { api } from "../lib/api";
import { formatMoney, goalIcon, type Goal, type GoalKind } from "../lib/goals";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

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

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Goal[]>("/goals");
      setGoals(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overall = goals.length ? Math.round(goals.reduce((sum, goal) => sum + goal.percent, 0) / goals.length) : 0;
  const projectGoals = goals.filter((goal) => goal.kind === "project").length;

  return (
    <div className="w-full max-w-[1600px] space-y-5">
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">Goals</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Long game board</h1>
        </div>
        <Button className="self-start sm:self-auto" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          New Goal
        </Button>
      </motion.div>

      <motion.div {...stagger(1)} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Overall Progress" value={`${overall}%`} />
        <SummaryCard label="Project Goals" value={String(projectGoals)} />
        <SummaryCard label="Active Goals" value={String(goals.length)} />
      </motion.div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading goals…</CardContent>
        </Card>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
            <div className="text-lg font-semibold">No goals yet</div>
            <p className="text-sm text-muted-foreground mt-1">Create your first goal to start the board.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {goals.map((goal, index) => {
            const Icon = goalIcon(goal.icon);
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
                          <span className="font-mono font-semibold tabular-nums">{goal.percent}%</span>
                        </div>
                        <ProgressBar percent={goal.percent} />
                      </div>

                      <GoalMeta goal={goal} />
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      <NewGoalDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} />
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

function GoalMeta({ goal }: { goal: Goal }) {
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
    return <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Target: {formatMoney(goal.money.currency, goal.money.target)}</div>;
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

function NewGoalDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (b: boolean) => void; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [kind, setKind] = useState<GoalKind>("project");
  const [moneyTarget, setMoneyTarget] = useState("");
  const [currency, setCurrency] = useState("LE");
  const [startingAmount, setStartingAmount] = useState("");
  const [weightStart, setWeightStart] = useState("");
  const [weightTarget, setWeightTarget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSubtitle("");
    setKind("project");
    setMoneyTarget("");
    setCurrency("LE");
    setStartingAmount("");
    setWeightStart("");
    setWeightTarget("");
  }, [open]);

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return toast.error("Title required");

    const body: Record<string, unknown> = { title: cleanTitle, subtitle: subtitle.trim(), kind };

    if (kind === "money") {
      const target = Number(moneyTarget);
      if (!Number.isFinite(target) || target <= 0) return toast.error("Target amount must be greater than 0");
      const start = startingAmount === "" ? 0 : Number(startingAmount);
      if (!Number.isFinite(start)) return toast.error("Starting amount must be a number");
      body.money = { target, currency: currency.trim() || "LE", startingAmount: start };
    }

    if (kind === "weight") {
      const start = Number(weightStart);
      const target = Number(weightTarget);
      if (!Number.isFinite(start) || start <= 0) return toast.error("Starting weight must be greater than 0");
      if (!Number.isFinite(target) || target <= 0) return toast.error("Target weight must be greater than 0");
      body.weight = { start, target, targetMax: target };
    }

    setSaving(true);
    try {
      await api.post("/goals", body);
      toast.success("Goal created");
      onOpenChange(false);
      await onCreated();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Goal</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you chasing?" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Subtitle</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="One line of context" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as GoalKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project board</SelectItem>
                <SelectItem value="money">Money target</SelectItem>
                <SelectItem value="weight">Body composition</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "money" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Target amount</Label>
                <Input inputMode="decimal" type="number" min="0" value={moneyTarget} onChange={(e) => setMoneyTarget(e.target.value)} placeholder="100000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="LE" />
              </div>
              <div className="space-y-1.5 col-span-3">
                <Label className="text-xs">Already saved (optional)</Label>
                <Input inputMode="decimal" type="number" value={startingAmount} onChange={(e) => setStartingAmount(e.target.value)} placeholder="0" />
              </div>
            </div>
          )}

          {kind === "weight" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Starting weight (kg)</Label>
                <Input inputMode="decimal" type="number" min="0" value={weightStart} onChange={(e) => setWeightStart(e.target.value)} placeholder="128.7" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Target weight (kg)</Label>
                <Input inputMode="decimal" type="number" min="0" value={weightTarget} onChange={(e) => setWeightTarget(e.target.value)} placeholder="105" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Creating…" : "Create Goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
