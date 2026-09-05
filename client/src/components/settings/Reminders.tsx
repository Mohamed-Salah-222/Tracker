import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Row, Section, Toggle } from "./SettingsShell";
import { useSettings } from "../../lib/useSettings";
import {
  CONDITIONS,
  CONDITION_LABELS,
  DAY_SHORT,
  SUGGESTIONS,
  createReminder,
  deleteReminder,
  disablePush,
  enablePush,
  listReminders,
  loadConfig,
  permission,
  reminderError,
  scheduleLabel,
  supportsPush,
  testPush,
  updateReminder,
  type Condition,
  type PushConfig,
  type Reminder,
} from "../../lib/reminders";

const dayLabel = (iso: string | null) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }) : null);

/** Add or edit one reminder. */
function ReminderDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Reminder | null; onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [time, setTime] = useState("21:00");
  const [days, setDays] = useState<number[]>([]);
  const [condition, setCondition] = useState<Condition | "">("");
  const [url, setUrl] = useState("/today");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(editing?.label ?? "");
    setBody(editing?.body ?? "");
    setTime(editing?.time ?? "21:00");
    setDays(editing?.days ?? []);
    setCondition(editing?.condition ?? "");
    setUrl(editing?.url ?? "/today");
  }, [open, editing]);

  const save = async () => {
    if (!label.trim()) return toast.error("Give it a name");
    setSaving(true);
    try {
      const payload = { label: label.trim(), body: body.trim(), time, days, condition: condition === "" ? null : condition, url };
      if (editing) await updateReminder(editing._id, payload);
      else await createReminder(payload);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(reminderError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[440px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit reminder" : "New reminder"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Log your day" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Line underneath</Label>
            <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Anything not written down yet." className="h-11" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 font-mono tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Opens</Label>
              <select value={url} onChange={(e) => setUrl(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-transparent px-2 text-[12px] outline-none focus:border-foreground">
                {["/today", "/", "/calories", "/workout", "/tasks", "/journal", "/badges"].map((u) => (
                  <option key={u} value={u}>
                    {u === "/" ? "Dashboard" : u.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Days</Label>
            <div className="flex flex-wrap gap-1">
              {DAY_SHORT.map((name, i) => {
                const picked = days.includes(i);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setDays(picked ? days.filter((d) => d !== i) : [...days, i].sort())}
                    className={`h-9 w-10 rounded-md border text-[11px] font-semibold transition-colors ${
                      picked ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{days.length === 0 ? "Nothing picked means every day." : ""}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Skip it if</Label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as Condition | "")}
              className="h-11 w-full rounded-lg border border-border bg-transparent px-2 text-[12px] outline-none focus:border-foreground"
            >
              <option value="">Always send it</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
            <p className="text-[11px] leading-snug text-muted-foreground">A reminder that arrives after you have already done the thing teaches you to ignore the next one.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={() => void save()} disabled={saving}>
            {editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Reminders
//
// In settings rather than in the nav: you set these up once and then never open the
// page again, which is the definition of a setting rather than a place.
// =====================================================================
/**
 * The nudges the app works out for itself.
 *
 * No form, because there is nothing to fill in: each one reads something the app
 * already knows and fires only when it applies. All you get is a switch.
 */
const AUTOMATIC: { key: string; label: string; hint: string }[] = [
  { key: "subscription", label: "A payment is coming", hint: "Two days before a subscription is charged, and while one is overdue." },
  { key: "goal", label: "A goal is running out", hint: "Three days before a goal's period ends." },
  { key: "kitchen", label: "The shopping list", hint: "Once there are three or more things to buy." },
  { key: "overdue", label: "Tasks left behind", hint: "Once three or more are still unfinished from earlier days." },
];

export function Reminders() {
  const { settings, update } = useSettings();
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [perm, setPerm] = useState<NotificationPermission>(permission());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, list] = await Promise.all([loadConfig(), listReminders()]);
      setConfig(c);
      setReminders(list);
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const turnOn = async () => {
    setBusy(true);
    const result = await enablePush(config?.publicKey ?? "");
    setPerm(permission());
    if (!result.ok) toast.error(result.reason ?? "Notifications could not be turned on");
    else toast.success("This device will be reminded");
    await load();
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setPerm(permission());
    await load();
    setBusy(false);
    toast.success("This device will not be reminded");
  };

  const subscribed = (config?.devices ?? 0) > 0 && perm === "granted";

  return (
    <>
      <Section
        title="Reminders"
        blurb="The app can measure a habit but never asked for one. These arrive whether or not it is open, on every device you allow."
        action={
          subscribed ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Add
            </Button>
          ) : undefined
        }
      >
        {!supportsPush() ? (
          <p className="text-[12px] text-muted-foreground">This browser cannot show notifications. On an iPhone, add the app to your home screen first.</p>
        ) : !config?.ready ? (
          <p className="text-[12px] text-muted-foreground">The server has no push keys configured, so nothing can be sent yet.</p>
        ) : (
          <>
            <Row
              label={subscribed ? "This device is on" : "Allow notifications"}
              hint={
                perm === "denied"
                  ? "Blocked for this site. Turn it back on in the browser's site settings, then reload."
                  : subscribed
                    ? `${config.devices} device${config.devices === 1 ? "" : "s"} subscribed. Reminders follow this device's clock.`
                    : "One tap. The browser will ask once."
              }
            >
              <div className="flex items-center gap-2">
                {subscribed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={busy}
                    onClick={() =>
                      void testPush()
                        .then(() => toast.success("Sent, it should appear now"))
                        .catch((e) => toast.error(reminderError(e)))
                    }
                  >
                    Test
                  </Button>
                )}
                <Button variant={subscribed ? "outline" : "default"} size="sm" className="h-9" disabled={busy || perm === "denied"} onClick={() => void (subscribed ? turnOff() : turnOn())}>
                  {subscribed ? <BellOff className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : <Bell className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                  {subscribed ? "Turn off here" : "Turn on"}
                </Button>
              </div>
            </Row>

            {subscribed && (
              <div className="border-t border-border pt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Worked out for you</div>
                {AUTOMATIC.map((auto) => (
                  <Row key={auto.key} label={auto.label} hint={auto.hint}>
                    <Toggle
                      label={auto.label}
                      on={settings.autoReminders?.[auto.key] !== false}
                      onChange={(next) => void update({ autoReminders: { [auto.key]: next } })}
                    />
                  </Row>
                ))}

                <Row label="Group them" hint="Several at once arrive as one notification rather than four in a row.">
                  <Toggle label="Group them" on={settings.digestAuto !== false} onChange={(next) => void update({ digestAuto: next })} />
                </Row>

                <Row label="Quiet hours" hint="Holds the worked-out ones until morning. A reminder you set yourself still goes off when you said.">
                  <Toggle label="Quiet hours" on={settings.quietHours?.enabled === true} onChange={(next) => void update({ quietHours: { enabled: next } })} />
                </Row>

                {settings.quietHours?.enabled && (
                  <div className="flex items-center justify-end gap-2 pb-3">
                    <Input
                      type="time"
                      value={settings.quietHours.from}
                      aria-label="Quiet from"
                      onChange={(e) => e.target.value && void update({ quietHours: { from: e.target.value } })}
                      className="h-9 w-28"
                    />
                    <span className="text-[11px] text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={settings.quietHours.to}
                      aria-label="Quiet until"
                      onChange={(e) => e.target.value && void update({ quietHours: { to: e.target.value } })}
                      className="h-9 w-28"
                    />
                  </div>
                )}
              </div>
            )}

            {subscribed && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Yours</div>
              </div>
            )}

            {subscribed && reminders.length === 0 && (
              <div className="pt-3">
                <p className="mb-2 text-[12px] text-muted-foreground">Nothing scheduled. Start from one of these, or add your own.</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void createReminder(s)
                          .then(load)
                          .then(() => toast.success(`${s.label} at ${s.time}`))
                          .catch((e) => toast.error(reminderError(e)))
                      }
                      className="rounded-full border border-border-strong px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted"
                    >
                      {s.label} · {s.time}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {reminders.map((reminder) => (
              <Row
                key={reminder._id}
                label={reminder.label}
                hint={[
                  scheduleLabel(reminder),
                  reminder.condition ? `skipped if ${CONDITION_LABELS[reminder.condition]}` : null,
                  reminder.lastSentOn ? `last ${dayLabel(reminder.lastSentOn)}` : "not sent yet",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <div className="flex items-center gap-2">
                  <Toggle label={reminder.label} on={reminder.enabled} onChange={(next) => void updateReminder(reminder._id, { enabled: next }).then(load)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 text-[11px]"
                    onClick={() => {
                      setEditing(reminder);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Delete ${reminder.label}`} onClick={() => void deleteReminder(reminder._id).then(load)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </Row>
            ))}

            {subscribed && (
              <p className="pt-3 text-[11px] leading-relaxed text-muted-foreground">
                Reminders are sent by the server, so they arrive with the app closed. If the server is asleep, a reminder can be a few minutes late or miss its minute
                entirely.
              </p>
            )}
          </>
        )}
      </Section>

      <ReminderDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </>
  );
}
