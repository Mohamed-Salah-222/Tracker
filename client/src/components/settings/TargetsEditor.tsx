import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { getApiError } from "../../lib/food";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";

/**
 * The targets every dashboard row is measured against.
 *
 * Lifted out of the dashboard so the settings page can host the same editor rather
 * than grow a second copy of it. Two doors, one component: the numbers cannot drift
 * because there is only one place that writes them.
 */
type GoalsResponse = {
  caloriesTarget: number;
  proteinTarget: number;
  waterTargetMl: number;
  stepsTarget: number;
  workDayMoney: number;
  sleepMinMinutes: number;
  sleepMaxMinutes: number;
  monthlyByKind: Record<string, number>;
  editableKinds: { kind: string; label: string; monthly: number | null }[];
};

const DAILY_FIELDS: { key: keyof GoalsResponse & string; label: string; suffix: string }[] = [
  { key: "caloriesTarget", label: "Calories", suffix: "cal / day" },
  { key: "proteinTarget", label: "Protein", suffix: "g / day" },
  { key: "waterTargetMl", label: "Water", suffix: "ml / day" },
  { key: "stepsTarget", label: "Steps", suffix: "steps / day" },
  { key: "workDayMoney", label: "Work", suffix: "$ / weekday" },
];

const hoursOf = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100);

export function TargetsEditor({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; onSaved: () => void }) {
  const [goals, setGoals] = useState<GoalsResponse | null>(null);
  const [daily, setDaily] = useState<Record<string, string>>({});
  const [monthly, setMonthly] = useState<Record<string, string>>({});
  const [sleepMin, setSleepMin] = useState("6");
  const [sleepMax, setSleepMax] = useState("8");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.get<GoalsResponse>("/dashboard/goals");
        if (cancelled) return;
        setGoals(r.data);
        setDaily(Object.fromEntries(DAILY_FIELDS.map((f) => [f.key, String(r.data[f.key] ?? 0)])));
        // Blank means "every day of the month" rather than zero.
        setMonthly(Object.fromEntries(r.data.editableKinds.map((k) => [k.kind, k.monthly === null ? "" : String(k.monthly)])));
        setSleepMin(hoursOf(r.data.sleepMinMinutes));
        setSleepMax(hoursOf(r.data.sleepMaxMinutes));
      } catch (e) {
        toast.error(getApiError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const save = async () => {
    if (!goals || saving) return;
    const body: Record<string, unknown> = {};

    for (const f of DAILY_FIELDS) {
      const n = Number(daily[f.key]);
      if (!Number.isFinite(n) || n < 0) return toast.error(`${f.label} must be zero or more`);
      body[f.key] = n;
    }

    const min = Number(sleepMin);
    const max = Number(sleepMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= 0) return toast.error("The sleep range must be hours");
    if (min > max) return toast.error("The shortest night cannot be longer than the longest");
    body.sleepMinMinutes = Math.round(min * 60);
    body.sleepMaxMinutes = Math.round(max * 60);

    const byKind: Record<string, number | null> = {};
    for (const k of goals.editableKinds) {
      const raw = (monthly[k.kind] ?? "").trim();
      if (raw === "") {
        byKind[k.kind] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return toast.error(`${k.label} must be zero or more`);
      byKind[k.kind] = n;
    }
    body.monthlyByKind = byKind;

    setSaving(true);
    try {
      await api.patch("/dashboard/goals", body);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1rem)] !max-w-[560px] max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Goals</DialogTitle>
        </DialogHeader>

        {!goals ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Daily amounts</h3>
              <p className="mb-2.5 text-[11px] text-muted-foreground">What counts as hitting it on a given day.</p>
              <div className="space-y-2">
                {DAILY_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm font-medium">{f.label}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={daily[f.key] ?? ""}
                      onChange={(e) => setDaily((d) => ({ ...d, [f.key]: e.target.value }))}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`${f.label} target`}
                      className="h-11 flex-1 font-mono tabular-nums"
                    />
                    <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{f.suffix}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sleep range</h3>
              <p className="mb-2.5 text-[11px] text-muted-foreground">A night inside this counts. The old habit spelled it into its own label, where nothing could read it.</p>
              <div className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-medium">Hours</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={sleepMin}
                  onChange={(e) => setSleepMin(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Shortest night that counts"
                  className="h-11 flex-1 font-mono tabular-nums"
                />
                <span className="shrink-0 text-[11px] text-muted-foreground">to</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={sleepMax}
                  onChange={(e) => setSleepMax(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Longest night that counts"
                  className="h-11 flex-1 font-mono tabular-nums"
                />
              </div>
            </section>

            <section className="border-t border-border pt-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Days per month</h3>
              <p className="mb-2.5 text-[11px] text-muted-foreground">How many days this month you mean to do it. Leave blank for every day.</p>
              <div className="space-y-2">
                {goals.editableKinds.map((k) => (
                  <div key={k.kind} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{k.label}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="every day"
                      value={monthly[k.kind] ?? ""}
                      onChange={(e) => setMonthly((m) => ({ ...m, [k.kind]: e.target.value }))}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`${k.label} days per month`}
                      className="h-11 w-32 shrink-0 text-right font-mono tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!goals || saving}>
            Save goals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}