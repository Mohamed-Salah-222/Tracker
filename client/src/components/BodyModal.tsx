import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { LineSeries, type LinePoint } from "./MiniChart";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
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
import { GROUP_LABEL, bodyError, deleteReading, fmtDelta, fmtValue, loadBody, loadMetrics, patchReading, saveReading, type BodyEntry, type BodyMetric, type BodySummary, type MetricView } from "../lib/body";

const dayShort = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLong = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * A measurement, its latest reading and where it is heading.
 *
 * Direction is shown by the arrow and by weight, never by colour: the palette here is
 * black and white, so a waist going the right way is stated rather than tinted green.
 */
function MetricTile({ metric, active, onSelect }: { metric: MetricView; active: boolean; onSelect: () => void }) {
  const delta = metric.deltas.month ?? metric.deltas.all;
  const label = fmtDelta(delta, metric);
  const arrow = !delta || delta.change === 0 ? "" : delta.change > 0 ? "↑" : "↓";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-xl border p-3 text-left transition-all ${active ? "border-foreground bg-muted/40" : "border-border hover:border-border-strong"}`}
    >
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{metric.latest ? fmtValue(metric.latest.value, metric) : "-"}</div>
      {label && (
        <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          <span aria-hidden>{arrow}</span>
          <span>{label}</span>
          {delta?.good === true && <span className="font-sans font-semibold uppercase tracking-wide text-foreground">good</span>}
        </div>
      )}
    </button>
  );
}

/** Which extras a reading captured, so the list says more than a weight. */
function ExtrasChips({ entry, metrics }: { entry: BodyEntry; metrics: BodyMetric[] }) {
  const captured = metrics.filter((m) => m.key !== "weightKg" && typeof entry[m.key] === "number");
  if (captured.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {captured.map((m) => (
        <span key={m.key} className="rounded-full border border-border px-1.5 py-px font-mono text-[9px] text-muted-foreground">
          {m.label} {fmtValue(entry[m.key] as number, m)}
        </span>
      ))}
    </div>
  );
}

// =====================================================================
// ReadingDialog
//
// Weight is required, everything else optional. The two groups start collapsed so a
// plain scale weigh-in is still three taps, while an InBody day has somewhere to go.
// =====================================================================
function ReadingDialog({
  open,
  onOpenChange,
  metrics,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: BodyMetric[];
  editing: BodyEntry | null;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? todayISO());
    setNote(editing?.note ?? "");
    const next: Record<string, string> = {};
    for (const m of metrics) {
      const v = editing?.[m.key];
      next[m.key] = typeof v === "number" ? String(v) : "";
    }
    setValues(next);
    // A group that already holds something opens itself, so an edit never hides data.
    const groups: Record<string, boolean> = {};
    for (const m of metrics) if (m.group !== "core" && next[m.key]) groups[m.group] = true;
    setOpenGroups(groups);
  }, [open, editing, metrics]);

  const save = async () => {
    if (!date) return toast.error("Pick a date");
    const body: Record<string, unknown> = { date, note };
    for (const m of metrics) {
      const raw = (values[m.key] ?? "").trim();
      // Empty clears the measurement rather than leaving yesterday's number behind.
      body[m.key] = raw === "" ? null : Number(raw);
    }
    if (body.weightKg === null) return toast.error("A weight is required");

    setSaving(true);
    try {
      if (editing) await patchReading(editing._id, body);
      else await saveReading(body);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(bodyError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteReading(editing._id);
      onSaved();
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(bodyError(e));
    } finally {
      setSaving(false);
    }
  };

  const field = (m: BodyMetric) => (
    <div key={m.key} className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {m.label} <span className="font-normal normal-case tracking-normal">({m.unit})</span>
      </Label>
      <Input
        type="number"
        inputMode="decimal"
        step={m.decimals >= 2 ? "0.01" : "0.1"}
        min={m.min}
        max={m.max}
        value={values[m.key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [m.key]: e.target.value }))}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 font-mono tabular-nums"
      />
    </div>
  );

  const groups: BodyMetric["group"][] = ["composition", "tape"];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[460px] max-h-[92svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit reading" : "New reading"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 font-mono tabular-nums" />
              </div>
              {metrics.filter((m) => m.group === "core").map(field)}
            </div>

            {groups.map((group) => {
              const list = metrics.filter((m) => m.group === group);
              if (list.length === 0) return null;
              const filled = list.filter((m) => (values[m.key] ?? "").trim() !== "").length;
              const isOpen = openGroups[group] ?? false;
              return (
                <div key={group} className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setOpenGroups((g) => ({ ...g, [group]: !isOpen }))}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{GROUP_LABEL[group]}</span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{filled > 0 ? `${filled} filled` : "optional"}</span>
                  </button>
                  {isOpen && <div className="grid grid-cols-2 gap-3 border-t border-border p-3">{list.map(field)}</div>}
                </div>
              );
            })}

            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Morning, before food" className="h-11" />
            </div>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            {editing ? (
              <Button variant="ghost" size="default" onClick={() => setDeleteOpen(true)} disabled={saving}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <Button variant="default" size="default" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reading?</AlertDialogTitle>
            <AlertDialogDescription>Every measurement taken on {editing ? dayLong(editing.date) : "that day"} goes with it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={() => void remove()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =====================================================================
// BodyModal
//
// Was the weight journey: one number, one chart. The scale is the least informative
// reading in body composition on its own, and the InBody fields it now shows have
// been on the model all along with no way in.
// =====================================================================
export function BodyModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<BodySummary | null>(null);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("weightKg");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BodyEntry | null>(null);
  const [targetDraft, setTargetDraft] = useState("100");
  const [savingTarget, setSavingTarget] = useState(false);
  const [visible, setVisible] = useState(8);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [summary, list] = await Promise.all([loadBody(todayISO()), loadMetrics()]);
      setData(summary);
      setMetrics(list);
      setTargetDraft(String(summary.goal.targetKg));
    } catch (e) {
      toast.error(bodyError(e));
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    void load();
  }, [load]);

  const tracked = useMemo(() => (data?.metrics ?? []).filter((m) => m.tracked), [data]);
  const current = useMemo(() => tracked.find((m) => m.key === selected) ?? tracked[0] ?? null, [tracked, selected]);
  const targetKg = data?.goal.targetKg ?? 100;

  /**
   * A body chart starting at zero is a flat line near the top, so the series sits
   * against its own floor and the hover card carries the real number.
   */
  const chartPoints = useMemo<LinePoint[]>(() => {
    if (!current || current.points.length === 0) return [];
    const values = current.points.map((p) => p.value);
    const floor = Math.floor(Math.min(...values, current.key === "weightKg" ? targetKg : Infinity) - 1);
    return current.points.map((p) => ({
      key: p.date,
      label: dayShort(p.date),
      value: Math.max(0, p.value - floor),
      tooltip: [dayLong(p.date), fmtValue(p.value, current), ...(current.key === "weightKg" ? [`Target ${targetKg} kg`] : [])],
    }));
  }, [current, targetKg]);

  const saveTarget = async () => {
    const parsed = Number(targetDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) return toast.error("Enter a valid target");
    setSavingTarget(true);
    try {
      await api.patch("/calories/weight-goal", { targetKg: parsed });
      await load();
      toast.success("Target updated");
    } catch (e) {
      toast.error(bodyError(e));
    } finally {
      setSavingTarget(false);
    }
  };

  const entries = data?.entries ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-[820px] max-h-[92svh] gap-0 overflow-y-auto p-0">
          <DialogTitle className="sr-only">Body</DialogTitle>

          <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress</div>
                <div className="mt-0.5 text-base font-semibold tracking-tight">Body</div>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                New reading
              </Button>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            {loading && !data ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[84px] rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-[260px] rounded-xl" />
              </div>
            ) : entries.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center">
                <div className="mb-1 text-base font-medium">Nothing measured yet.</div>
                <div className="mb-4 text-sm text-muted-foreground">Weight is required, the rest is optional. Fat, muscle, water and the tape all chart the same way.</div>
                <Button variant="default" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  New reading
                </Button>
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div key="body" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {tracked.map((m) => (
                      <MetricTile key={m.key} metric={m} active={current?.key === m.key} onSelect={() => setSelected(m.key)} />
                    ))}
                  </div>

                  {current && (
                    <Card>
                      <CardContent className="p-4 sm:p-5">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{current.label}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                              <span>{current.readings} readings</span>
                              {(["week", "month", "quarter"] as const).map((w) => {
                                const text = fmtDelta(current.deltas[w], current);
                                return text ? (
                                  <span key={w}>
                                    · {w === "week" ? "7d" : w === "month" ? "30d" : "90d"} {text}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          </div>
                          {current.key === "weightKg" && (
                            <div className="flex items-center gap-2">
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target</Label>
                              <Input className="h-8 w-20 font-mono tabular-nums" type="number" step="0.1" min="0" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} />
                              <Button variant="outline" size="sm" onClick={() => void saveTarget()} disabled={savingTarget}>
                                Save
                              </Button>
                            </div>
                          )}
                        </div>
                        <LineSeries points={chartPoints} height={224} emptyLabel="Two readings and the trend shows up here." />
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardContent className="p-4 sm:p-5">
                      <div className="mb-3 flex items-baseline justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Readings</div>
                        <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {Math.min(visible, entries.length)} of {entries.length}
                        </div>
                      </div>
                      <div className="divide-y divide-border rounded-[10px] border border-border bg-card px-3">
                        {entries.slice(0, visible).map((entry) => (
                          <button
                            key={entry._id}
                            type="button"
                            onClick={() => {
                              setEditing(entry);
                              setAddOpen(true);
                            }}
                            className="w-full rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{dayLong(entry.date)}</div>
                                {entry.note && <div className="truncate text-xs text-muted-foreground">{entry.note}</div>}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="font-mono text-sm font-semibold tabular-nums">{entry.weightKg.toFixed(1)} kg</div>
                                {entry.fatKg !== null && <div className="font-mono text-[10px] tabular-nums text-muted-foreground">{entry.fatKg.toFixed(1)} kg fat</div>}
                              </div>
                            </div>
                            <ExtrasChips entry={entry} metrics={metrics} />
                          </button>
                        ))}
                      </div>
                      {visible < entries.length && (
                        <div className="flex justify-center pt-3">
                          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + 12)}>
                            Show earlier
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ReadingDialog
        open={addOpen}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
          setAddOpen(next);
        }}
        metrics={metrics}
        editing={editing}
        onSaved={load}
      />
    </>
  );
}
