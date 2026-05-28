import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AxiosError } from "axios";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

type WeightEntry = {
  _id: string;
  date: string;
  weightKg: number;
  note: string;
  deletedAt: string | null;
};

type WeightGoal = {
  _id: string;
  targetKg: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtKg = (n: number) => `${round1(n).toFixed(1)} kg`;
const dayShort = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLong = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-lg font-semibold font-mono tabular-nums mt-1 truncate">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function WeightRow({ entry, onEdit }: { entry: WeightEntry; onEdit: (entry: WeightEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(entry)}
      className="w-full flex items-center justify-between gap-3 py-2 px-1 hover:bg-muted/40 rounded-md transition-colors text-left cursor-pointer"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{dayLong(entry.date.slice(0, 10))}</div>
        {entry.note && <div className="text-xs text-muted-foreground truncate">{entry.note}</div>}
      </div>
      <span className="text-sm font-semibold font-mono tabular-nums shrink-0">{fmtKg(entry.weightKg)}</span>
    </button>
  );
}

interface WeighInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: WeightEntry | null;
  onSaved: () => void;
}

function WeighInDialog({ open, onOpenChange, editing, onSaved }: WeighInDialogProps) {
  const [date, setDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date.slice(0, 10));
      setWeightKg(String(editing.weightKg));
      setNote(editing.note ?? "");
    } else {
      setDate(todayISO());
      setWeightKg("");
      setNote("");
    }
  }, [open, editing]);

  const save = async () => {
    const parsed = parseFloat(weightKg);
    if (!date) return toast.error("Date required");
    if (isNaN(parsed) || parsed <= 0) return toast.error("Enter a valid weight");

    setSaving(true);
    try {
      const payload = { date, weightKg: parsed, note };
      if (editing) {
        await api.patch(`/calories/weight/${editing._id}`, payload);
        toast.success("Weigh-in updated");
      } else {
        await api.post("/calories/weight", payload);
        toast.success("Weigh-in saved");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.delete(`/calories/weight/${editing._id}`);
      toast.success("Weigh-in deleted");
      onSaved();
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit weigh-in" : "Add weigh-in"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Weight (kg)</Label>
                <Input type="number" step="0.1" min="0" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className="font-mono tabular-nums" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            {editing ? (
              <Button
                variant="ghost"
                size="default"
                onClick={() => {
                  setDeleteOpen(true);
                }}
                disabled={saving}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <Button variant="default" size="default" onClick={save} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this weigh-in?</AlertDialogTitle>
            <AlertDialogDescription>This removes it from the weight journey only.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={del}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function WeightModal({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [goal, setGoal] = useState<WeightGoal | null>(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [targetDraft, setTargetDraft] = useState("100");
  const [savingTarget, setSavingTarget] = useState(false);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [weightRows, weightGoal] = await Promise.all([
        api.get<WeightEntry[]>("/calories/weight"),
        api.get<WeightGoal>("/calories/weight-goal"),
      ]);
      setEntries(weightRows.data);
      setGoal(weightGoal.data);
      setTargetDraft(String(weightGoal.data.targetKg));
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAsc = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries],
  );
  const sortedDesc = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  const first = sortedAsc[0] ?? null;
  const latest = sortedAsc[sortedAsc.length - 1] ?? null;
  const targetKg = goal?.targetKg ?? 100;
  const totalLost = first && latest && sortedAsc.length > 1 ? first.weightKg - latest.weightKg : null;
  const remaining = latest ? latest.weightKg - targetKg : null;

  const yDomain = useMemo<[number, number]>(() => {
    const weights = sortedAsc.map((entry) => entry.weightKg);
    const min = Math.min(targetKg, ...weights);
    const max = Math.max(targetKg, ...weights);
    return [Math.max(0, Math.floor(min - 2)), Math.ceil(max + 2)];
  }, [sortedAsc, targetKg]);

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) setEditing(null);
    setAddOpen(next);
  };

  const saveTarget = async () => {
    const parsed = parseFloat(targetDraft);
    if (isNaN(parsed) || parsed <= 0) return toast.error("Enter a valid target");
    setSavingTarget(true);
    try {
      const r = await api.patch<WeightGoal>("/calories/weight-goal", { targetKg: parsed });
      setGoal(r.data);
      setTargetDraft(String(r.data.targetKg));
      toast.success("Target updated");
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSavingTarget(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-[820px] max-h-[92vh] overflow-y-auto p-0 gap-0">
          <DialogTitle className="sr-only">Weight Journey</DialogTitle>

          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Progress</div>
                <div className="text-base font-semibold tracking-tight mt-0.5">Weight Journey</div>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add weigh-in
              </Button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <AnimatePresence mode="wait">
              {loading && entries.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
              ) : sortedAsc.length === 0 ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="py-16 text-center">
                  <div className="text-base font-medium mb-1">No weigh-ins yet.</div>
                  <div className="text-sm text-muted-foreground mb-4">Add your first weigh-in to start the chart.</div>
                  <Button variant="default" size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add weigh-in
                  </Button>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Current" value={latest ? fmtKg(latest.weightKg) : "--"} sub={latest ? dayLong(latest.date.slice(0, 10)) : undefined} />
                    <StatCard label="Target" value={fmtKg(targetKg)} />
                    <StatCard
                      label="Total lost"
                      value={totalLost === null ? "--" : `${totalLost >= 0 ? "-" : "+"}${fmtKg(Math.abs(totalLost))}`}
                      sub={first ? `since ${dayShort(first.date.slice(0, 10))}` : undefined}
                    />
                    <StatCard
                      label="Remaining"
                      value={remaining === null ? "--" : remaining <= 0 ? "Goal reached" : fmtKg(remaining)}
                    />
                  </div>

                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Trend</div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Target</Label>
                          <Input
                            className="h-8 w-20 font-mono tabular-nums"
                            type="number"
                            step="0.1"
                            min="0"
                            value={targetDraft}
                            onChange={(e) => setTargetDraft(e.target.value)}
                          />
                          <Button variant="outline" size="sm" onClick={saveTarget} disabled={savingTarget}>
                            Save
                          </Button>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sortedAsc} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => dayShort(String(v).slice(0, 10))} stroke="var(--color-border)" />
                            <YAxis domain={yDomain} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} stroke="var(--color-border)" width={42} />
                            <Tooltip
                              cursor={{ stroke: "var(--color-border)" }}
                              contentStyle={{
                                background: "var(--color-card)",
                                border: "1px solid var(--color-border)",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                              labelFormatter={(label) => dayLong(String(label).slice(0, 10))}
                              formatter={(value) => [`${Number(value).toFixed(1)} kg`, "Weight"]}
                            />
                            <ReferenceLine
                              y={targetKg}
                              stroke="var(--color-muted-foreground)"
                              strokeDasharray="4 4"
                              label={{ value: "Target", position: "insideTopRight", fill: "var(--color-muted-foreground)", fontSize: 10 }}
                            />
                            <Line type="monotone" dataKey="weightKg" stroke="var(--color-income)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-income)" }} activeDot={{ r: 5 }} animationDuration={500} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Recent weigh-ins</div>
                      <div className="rounded-[10px] border border-border bg-card px-3 divide-y divide-border">
                        {sortedDesc.map((entry, i) => (
                          <motion.div key={entry._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: i * 0.04 }}>
                            <WeightRow
                              entry={entry}
                              onEdit={(next) => {
                                setEditing(next);
                                setAddOpen(true);
                              }}
                            />
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <WeighInDialog open={addOpen} onOpenChange={handleDialogOpenChange} editing={editing} onSaved={load} />
    </>
  );
}
