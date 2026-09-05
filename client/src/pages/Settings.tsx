import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Download, RotateCcw, Settings as SettingsIcon, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { listHabits, type HabitDef } from "../lib/habits";
import { TargetsEditor } from "../components/settings/TargetsEditor";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Choice, Row, Section, Toggle } from "../components/settings/SettingsShell";
import { Reminders } from "../components/settings/Reminders";
import { emptyTrash, listTrash, undo, type TrashBatch } from "../lib/undo";
import { MODULES } from "../lib/modules";
import { DAY_NAMES, type Accent, type Density, type Font, type Theme } from "../lib/settings";
import { useSettings } from "../lib/useSettings";
import { Skeleton } from "../components/ui/skeleton";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

const PRESET_LABELS: { key: "simple" | "standard" | "everything"; label: string; blurb: string }[] = [
  { key: "simple", label: "Simple", blurb: "Habits, today and tasks. Nothing else." },
  { key: "standard", label: "Standard", blurb: "Adds food, sleep, journal, goals and badges." },
  { key: "everything", label: "Everything", blurb: "Every page the app has." },
];

// =====================================================================
// Settings
//
// One home for what the app is. Before this there were five: two singleton documents,
// the habits page, and six localStorage keys holding preferences that belonged to a
// browser rather than to a person.
//
// Nothing here is duplicated from another page. Where an editor already exists it is
// the same component, opened from a second door.
// =====================================================================
export default function Settings() {
  const { settings, loaded, update } = useSettings();
  const [busy, setBusy] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [habits, setHabits] = useState<HabitDef[]>([]);
  const [split, setSplit] = useState<{ splitId: string; stallNoticeSessions: number; stallDeloadSessions: number } | null>(null);
  const [backup, setBackup] = useState<{ documents: number; collections: { collection: string; documents: number }[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [trash, setTrash] = useState<TrashBatch[]>([]);

  // The rows the grid can show, and the workout thresholds, both read from the pages
  // that own them rather than copied into this one.
  useEffect(() => {
    void listHabits()
      .then(setHabits)
      .catch(() => setHabits([]));
    void api
      .get<{ splitId: string; stallNoticeSessions: number; stallDeloadSessions: number }>("/workouts/settings")
      .then((r) => setSplit(r.data))
      .catch(() => setSplit(null));
    void api
      .get<{ documents: number; collections: { collection: string; documents: number }[] }>("/export/summary")
      .then((r) => setBackup(r.data))
      .catch(() => setBackup(null));
    void listTrash()
      .then(setTrash)
      .catch(() => setTrash([]));
  }, []);

  /**
   * Ask the server for the whole file and hand it to the browser as a download.
   *
   * Fetched rather than linked so a failure is a message instead of a browser error
   * page, and so the date the backup was taken can be refreshed straight afterwards.
   */
  const exportAll = async () => {
    setExporting(true);
    try {
      const r = await api.get("/export", { responseType: "blob" });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lifetracker-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
      await update({});
    } catch {
      toast.error("The export could not be built");
    } finally {
      setExporting(false);
    }
  };

  const on = useMemo(() => MODULES.filter((m) => settings.modules[m.key] !== false).length, [settings.modules]);

  /** Which preset the current switches happen to match, if any. */
  const activePreset = useMemo(() => {
    const enabledKeys = MODULES.filter((m) => settings.modules[m.key] !== false)
      .map((m) => m.key)
      .sort()
      .join(",");
    const presets: Record<string, string[]> = {
      simple: ["tasks"],
      standard: ["tasks", "journal", "sleep", "calories", "foods", "goals", "badges"],
      everything: MODULES.map((m) => m.key),
    };
    return Object.keys(presets).find((key) => [...presets[key]].sort().join(",") === enabledKeys) ?? null;
  }, [settings.modules]);

  if (!loaded) {
    return (
      <div className="w-full max-w-[760px] space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[140px] rounded-xl" />
        ))}
      </div>
    );
  }

  const applyPreset = async (preset: "simple" | "standard" | "everything") => {
    setBusy(true);
    await update({ preset });
    setBusy(false);
  };

  return (
    <div className="w-full max-w-[760px] space-y-3 pb-2">
      <motion.header {...fadeUp} className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </motion.header>

      {/* ===== How much app ===== */}
      <Section
        title="How much app"
        blurb={`Switch off anything you do not use and it disappears completely: its pages, the rows it feeds on the dashboard, and the badges that score it. Nothing is deleted, and switching it back on restores everything. ${on} of ${MODULES.length} on.`}
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {PRESET_LABELS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={busy}
              onClick={() => void applyPreset(preset.key)}
              aria-pressed={activePreset === preset.key}
              className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                activePreset === preset.key ? "border-foreground bg-muted/60" : "border-border hover:border-border-strong"
              }`}
            >
              <div className="text-[13px] font-semibold">{preset.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{preset.blurb}</div>
            </button>
          ))}
        </div>

        <div>
          {MODULES.map((module) => (
            <Row key={module.key} label={module.label} hint={module.blurb}>
              <Toggle
                label={module.label}
                on={settings.modules[module.key] !== false}
                onChange={(next) => void update({ modules: { [module.key]: next } })}
              />
            </Row>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">The dashboard, Today, Habits and this page are always here.</p>
      </Section>

      <Reminders />

      {/* ===== Targets ===== */}
      <Section
        title="Targets"
        blurb="What counts as hitting it: calories, protein, water, steps, the sleep range, and how many days a month each habit is meant to be kept. The same editor the dashboard opens, not a copy of it."
        action={
          <Button variant="outline" size="sm" className="h-9" onClick={() => setTargetsOpen(true)}>
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Edit targets
          </Button>
        }
      >
        <p className="text-[12px] text-muted-foreground">Also reachable from the Goals button on the dashboard.</p>
      </Section>

      {/* ===== Dashboard rows ===== */}
      <Section title="Dashboard rows" blurb="Which habits appear on the grid. Hiding one keeps its history and its badges, it only takes it off the screen. This used to be saved per browser, so the phone and the laptop disagreed.">
        {habits.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No habits yet.</p>
        ) : (
          <div>
            {habits.map((habit) => (
              <Row key={habit.key} label={habit.label} hint={habit.description}>
                <Toggle
                  label={habit.label}
                  on={!settings.dashboard.hiddenRows.includes(habit.key)}
                  onChange={(next) => {
                    const hidden = next ? settings.dashboard.hiddenRows.filter((k) => k !== habit.key) : [...settings.dashboard.hiddenRows, habit.key];
                    void update({ dashboard: { hiddenRows: hidden } });
                  }}
                />
              </Row>
            ))}
          </div>
        )}
      </Section>

      {/* ===== Workout ===== */}
      {settings.modules.workout !== false && (
        <Section title="Workout" blurb="The rest timer follows you now rather than the device it was switched on from.">
          <Row label="Rest timer" hint="A countdown after each set, with a chime.">
            <Toggle label="Rest timer" on={settings.workout.restTimerEnabled} onChange={(next) => void update({ workout: { restTimerEnabled: next } })} />
          </Row>
          <Row label="Rest length">
            <Choice<string>
              label="Rest length"
              value={String(settings.workout.restSeconds)}
              onChange={(seconds) => void update({ workout: { restSeconds: Number(seconds) } })}
              options={[
                { key: "60", label: "60s" },
                { key: "90", label: "90s" },
                { key: "120", label: "2m" },
                { key: "180", label: "3m" },
              ]}
            />
          </Row>
          {split && (
            <>
              <Row label="Stall notice" hint="Sessions with no progress before the app mentions it.">
                <Input
                  type="number"
                  min={2}
                  max={12}
                  value={split.stallNoticeSessions}
                  onChange={(e) => setSplit({ ...split, stallNoticeSessions: Number(e.target.value) })}
                  onBlur={() => void api.patch("/workouts/settings", { stallNoticeSessions: split.stallNoticeSessions }).catch(() => {})}
                  className="h-9 w-20 font-mono tabular-nums"
                />
              </Row>
              <Row label="Deload after" hint="Sessions with no progress before it suggests backing off.">
                <Input
                  type="number"
                  min={2}
                  max={20}
                  value={split.stallDeloadSessions}
                  onChange={(e) => setSplit({ ...split, stallDeloadSessions: Number(e.target.value) })}
                  onBlur={() => void api.patch("/workouts/settings", { stallDeloadSessions: split.stallDeloadSessions }).catch(() => {})}
                  className="h-9 w-20 font-mono tabular-nums"
                />
              </Row>
            </>
          )}
        </Section>
      )}

      {/* ===== Appearance ===== */}
      <Section title="Appearance" blurb="The palette is black and white by design: every state in this app is told apart by weight rather than hue. The accent is the one exception, and only for the filled state.">
        <Row label="Theme" hint="System follows your device.">
          <Choice<Theme>
            label="Theme"
            value={settings.appearance.theme}
            onChange={(theme) => void update({ appearance: { theme } })}
            options={[
              { key: "system", label: "System" },
              { key: "light", label: "Light" },
              { key: "dark", label: "Dark" },
            ]}
          />
        </Row>
        <Row label="Font">
          <Choice<Font>
            label="Font"
            value={settings.appearance.font}
            onChange={(font) => void update({ appearance: { font } })}
            options={[
              { key: "geist", label: "Geist" },
              { key: "system", label: "System" },
              { key: "serif", label: "Serif" },
              { key: "mono", label: "Mono" },
            ]}
          />
        </Row>
        <Row label="Density" hint="Compact tightens every gap and padding, which is worth it on a phone.">
          <Choice<Density>
            label="Density"
            value={settings.appearance.density}
            onChange={(density) => void update({ appearance: { density } })}
            options={[
              { key: "comfortable", label: "Comfortable" },
              { key: "compact", label: "Compact" },
            ]}
          />
        </Row>
        <Row label="Accent" hint="Used only where something is filled in as done.">
          <Choice<Accent>
            label="Accent"
            value={settings.appearance.accent}
            onChange={(accent) => void update({ appearance: { accent } })}
            options={[
              { key: "mono", label: "None" },
              { key: "blue", label: "Blue" },
              { key: "green", label: "Green" },
              { key: "amber", label: "Amber" },
              { key: "violet", label: "Violet" },
            ]}
          />
        </Row>
      </Section>

      {/* ===== The week ===== */}
      <Section title="The week" blurb="Which days are yours. The weekend was hardcoded to Saturday and Sunday, which auto-excused the wrong days on the work row.">
        <Row label="Week starts on">
          <select
            value={settings.week.startsOn}
            onChange={(e) => void update({ week: { startsOn: Number(e.target.value) } })}
            className="h-9 rounded-lg border border-border bg-transparent px-2 text-[12px] outline-none transition-colors focus:border-foreground"
          >
            {DAY_NAMES.map((day, i) => (
              <option key={day} value={i}>
                {day}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Weekend" hint="Work is not expected on these days, so they are excused rather than missed.">
          <div className="flex flex-wrap gap-1">
            {DAY_NAMES.map((day, i) => {
              const picked = settings.week.weekendDays.includes(i);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => {
                    const next = picked ? settings.week.weekendDays.filter((d) => d !== i) : [...settings.week.weekendDays, i];
                    if (next.length > 5) return;
                    void update({ week: { weekendDays: next.sort() } });
                  }}
                  className={`h-8 w-9 rounded-md border text-[11px] font-semibold transition-colors ${
                    picked ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {day.slice(0, 2)}
                </button>
              );
            })}
          </div>
        </Row>
      </Section>

      {/* ===== Recently deleted ===== */}
      <Section
        title="Recently deleted"
        blurb="Anything removed in the last thirty days, and a way to put it back. Deleting used to be final everywhere in this app, which is the wrong answer for something you tap on a phone."
        action={
          trash.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-muted-foreground"
              onClick={() =>
                void emptyTrash()
                  .then(() => setTrash([]))
                  .then(() => toast.success("The bin is empty"))
              }
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Empty
            </Button>
          ) : undefined
        }
      >
        {trash.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Nothing has been deleted lately.</p>
        ) : (
          <div>
            {trash.map((batch) => (
              <Row
                key={batch.batch}
                label={batch.labels.length > 0 ? batch.labels.join(", ") : batch.collections.join(", ")}
                hint={`${batch.count === 1 ? "1 record" : batch.count + " records"} · ${new Date(batch.deletedAt).toLocaleString("en-US", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
              >
                <Button variant="outline" size="sm" className="h-9" onClick={() => void undo(batch.batch)}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Restore
                </Button>
              </Row>
            ))}
          </div>
        )}
      </Section>

      {/* ===== Your data ===== */}
      <Section
        title="Your data"
        blurb="Everything this app holds, as one JSON file. Only the collections this app owns are included: the database is shared with another application, and an export that swept up somebody else's rows would be a leak dressed up as a backup."
        action={
          <Button variant="outline" size="sm" className="h-9" onClick={() => void exportAll()} disabled={exporting}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {exporting ? "Building…" : "Export"}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          {backup && (
            <span>
              {backup.documents.toLocaleString("en-US")} records across {backup.collections.length} collections
            </span>
          )}
          <span className="font-sans">
            {settings.lastExportAt ? `Last exported ${new Date(settings.lastExportAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}` : "Never exported"}
          </span>
        </div>
      </Section>

      <TargetsEditor open={targetsOpen} onOpenChange={setTargetsOpen} onSaved={() => setTargetsOpen(false)} />
    </div>
  );
}
