import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { CalendarClock, Landmark, Plus, Trash2, Users, Wallet as WalletIcon, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "./ui/select";
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
import {
  CATEGORIES,
  CYCLES,
  MONTHS,
  WEEKDAYS,
  chargeSubscription,
  dueLabel,
  loadSubscriptions,
  scheduleLabel,
  skipSubscription,
  subsError,
  type Category,
  type Cycle,
  type SourceType,
  type Subscription,
  type SubscriptionsSummary,
} from "../lib/subscriptions";

type Wallet = { _id: string; name: string };
type Bank = { _id: string; name: string; currency: "EGP" | "USD" };
type ExternalSource = { _id: string; name: string };

export interface SubscriptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  onChanged: () => void;
}

const fmtEGP = (n: number) => `${Math.round(Math.abs(n)).toLocaleString("en-US")} L.E`;
const dayLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

const encodeSource = (type: SourceType, id: string) => `${type}:${id}`;

function decodeSource(encoded: string): { sourceType: SourceType; sourceId: string } | null {
  const colon = encoded.indexOf(":");
  if (colon < 0) return null;
  const sourceType = encoded.slice(0, colon) as SourceType;
  const sourceId = encoded.slice(colon + 1);
  if (!["wallet", "bank", "external"].includes(sourceType) || !sourceId) return null;
  return { sourceType, sourceId };
}

function SourceTypeIcon({ sourceType, className = "h-3.5 w-3.5" }: { sourceType: SourceType; className?: string }) {
  if (sourceType === "bank") return <Landmark className={className} />;
  if (sourceType === "external") return <Users className={className} />;
  return <WalletIcon className={className} />;
}

function SourcePicker({
  wallets,
  banks,
  externalSources,
  value,
  onChange,
}: {
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder="Select source..." />
      </SelectTrigger>
      <SelectContent>
        {wallets.length > 0 && (
          <SelectGroup>
            <SelectLabel>
              <WalletIcon className="mr-1 inline h-3 w-3 opacity-60" />
              Wallets
            </SelectLabel>
            {wallets.map((w) => (
              <SelectItem key={w._id} value={encodeSource("wallet", w._id)}>
                {w.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {wallets.length > 0 && banks.length > 0 && <SelectSeparator />}
        {banks.length > 0 && (
          <SelectGroup>
            <SelectLabel>
              <Landmark className="mr-1 inline h-3 w-3 opacity-60" />
              Banks
            </SelectLabel>
            {banks.map((b) => (
              <SelectItem key={b._id} value={encodeSource("bank", b._id)}>
                {b.name} ({b.currency})
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {(wallets.length > 0 || banks.length > 0) && externalSources.length > 0 && <SelectSeparator />}
        {externalSources.length > 0 && (
          <SelectGroup>
            <SelectLabel>
              <Users className="mr-1 inline h-3 w-3 opacity-60" />
              Family money
            </SelectLabel>
            {externalSources.map((s) => (
              <SelectItem key={s._id} value={encodeSource("external", s._id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * One line, and the two buttons that were the missing half of this feature.
 *
 * Recording the charge is deliberately a press rather than something that happens on
 * a timer: money leaving an account without being asked is not a convenience. Skip is
 * there for the month that was free or was paid outside the app, so the schedule can
 * move on without inventing an expense.
 */
function SubscriptionRow({
  sub,
  busy,
  onEdit,
  onCharge,
  onSkip,
}: {
  sub: Subscription;
  busy: boolean;
  onEdit: () => void;
  onCharge: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 py-2.5">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left transition-colors hover:bg-muted/40">
        <span
          className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${
            sub.overdue ? "border-foreground bg-foreground text-background" : sub.due ? "border-foreground text-foreground" : "border-border text-muted-foreground"
          }`}
        >
          {sub.due ? dueLabel(sub) : dayLabel(sub.nextDue)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{sub.name}</span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <SourceTypeIcon sourceType={sub.sourceType} className="h-3 w-3 shrink-0" />
            <span className="truncate">{sub.sourceNameSnapshot}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{scheduleLabel(sub)}</span>
            {sub.cycle !== "monthly" && <span className="whitespace-nowrap font-mono">≈ {fmtEGP(sub.monthlyEquivalent)}/mo</span>}
          </span>
        </span>
      </button>

      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{fmtEGP(sub.price)}</span>

      {sub.due && (
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <Button variant="default" size="sm" className="h-8 flex-1 sm:flex-none" disabled={busy} onClick={onCharge}>
            Pay {sub.owedCount > 1 ? `1 of ${sub.owedCount}` : ""}
          </Button>
          <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={onSkip}>
            Skip
          </Button>
        </div>
      )}
    </div>
  );
}

function SubscriptionDialog({
  open,
  onOpenChange,
  wallets,
  banks,
  externalSources,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  editing: Subscription | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [billingDay, setBillingDay] = useState("1");
  const [billingWeekday, setBillingWeekday] = useState("1");
  const [billingMonth, setBillingMonth] = useState("1");
  const [category, setCategory] = useState<Category>("bills");
  const [startDate, setStartDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPrice(editing ? String(editing.price) : "");
    setSource(editing ? encodeSource(editing.sourceType, editing.sourceId) : "");
    setCycle(editing?.cycle ?? "monthly");
    setBillingDay(String(editing?.billingDay ?? 1));
    setBillingWeekday(String(editing?.billingWeekday ?? 1));
    setBillingMonth(String(editing?.billingMonth ?? 1));
    setCategory(editing?.category ?? "bills");
    setStartDate(editing?.startDate ?? todayISO());
    setNote(editing?.note ?? "");
  }, [open, editing]);

  const save = async () => {
    const parsedPrice = parseFloat(price);
    const decoded = decodeSource(source);
    if (!name.trim()) return toast.error("Name required");
    if (isNaN(parsedPrice) || parsedPrice < 0) return toast.error("Enter a valid price");
    if (!decoded) return toast.error("Select a source");

    const payload: Record<string, unknown> = {
      name: name.trim(),
      price: parsedPrice,
      sourceType: decoded.sourceType,
      sourceId: decoded.sourceId,
      cycle,
      billingDay: parseInt(billingDay, 10),
      billingWeekday: cycle === "weekly" ? parseInt(billingWeekday, 10) : null,
      billingMonth: cycle === "yearly" ? parseInt(billingMonth, 10) : null,
      category,
      startDate,
      note: note.trim(),
      today: todayISO(),
    };

    setSaving(true);
    try {
      if (editing) await api.patch(`/payments/subscriptions/${editing._id}`, payload);
      else await api.post("/payments/subscriptions", payload);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(subsError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.delete(`/payments/subscriptions/${editing._id}`);
      onSaved();
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(subsError(e));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, children: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit subscription" : "Add subscription"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {field("Name", <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gym membership, Netflix..." />)}
            <div className="grid grid-cols-2 gap-3">
              {field(
                "Price (L.E)",
                <Input className="font-mono tabular-nums" type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />,
              )}
              {field(
                "Category",
                <Select value={category} onValueChange={(v) => setCategory((v ?? "bills") as Category)}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
              )}
            </div>

            {field("Source", <SourcePicker wallets={wallets} banks={banks} externalSources={externalSources} value={source} onChange={setSource} />)}

            {field(
              "Repeats",
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border-strong p-1">
                {CYCLES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCycle(c.key)}
                    aria-pressed={cycle === c.key}
                    className={`h-8 rounded-md text-xs font-semibold transition-colors ${cycle === c.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>,
            )}

            {cycle === "weekly" &&
              field(
                "On",
                <Select value={billingWeekday} onValueChange={(v) => setBillingWeekday(v ?? "1")}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
              )}

            {cycle !== "weekly" && (
              <div className="grid grid-cols-2 gap-3">
                {field(
                  "Day of the month",
                  <Input className="font-mono tabular-nums" type="number" min="1" max="31" step="1" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />,
                )}
                {cycle === "yearly" &&
                  field(
                    "Month",
                    <Select value={billingMonth} onValueChange={(v) => setBillingMonth(v ?? "1")}>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={m} value={String(i + 1)}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>,
                  )}
              </div>
            )}

            {field(
              "Started",
              <>
                <Input type="date" className="font-mono tabular-nums" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Nothing is owed before this, so adding an old service does not invoice you for a year of it.</p>
              </>,
            )}

            {field("Note", <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />)}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            {editing ? (
              <Button variant="ghost" size="default" onClick={() => setDeleteOpen(true)} disabled={saving}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <Button variant="default" size="default" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this subscription?</AlertDialogTitle>
            <AlertDialogDescription>The expenses it already recorded stay where they are.</AlertDialogDescription>
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
// SubscriptionsModal
//
// This was a list of names, prices and a day of the month, and nothing ever happened
// on that day. The record existed and the charge did not, which made the most
// predictable money in the app the only kind it could not see coming.
// =====================================================================
export function SubscriptionsModal({ open, onOpenChange, wallets, banks, externalSources, onChanged }: SubscriptionsModalProps) {
  const [data, setData] = useState<SubscriptionsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadSubscriptions(todayISO()));
    } catch (e) {
      toast.error(subsError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const act = async (sub: Subscription, what: "charge" | "skip") => {
    setBusyId(sub._id);
    try {
      if (what === "charge") {
        await chargeSubscription(sub._id, todayISO());
        toast.success(`${sub.name} recorded as paid`);
      } else {
        await skipSubscription(sub._id, todayISO());
        toast.success(`${sub.name} skipped`);
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(subsError(e));
    } finally {
      setBusyId(null);
    }
  };

  const items = data?.items ?? [];
  const owing = data?.owing ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="flex max-h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <DialogTitle className="text-base font-medium">Subscriptions</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {data && (
            <div className="shrink-0 border-b border-border px-5 py-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-[10px] border border-border bg-card px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Per month</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{fmtEGP(data.monthlyTotal)}</div>
                </div>
                <div className="rounded-[10px] border border-border bg-card px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Per year</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{fmtEGP(data.yearlyTotal)}</div>
                </div>
                <div className="rounded-[10px] border border-border bg-card px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next 30 days</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{fmtEGP(data.dueSoonTotal)}</div>
                </div>
                <div className={`rounded-[10px] border px-3 py-2.5 ${owing.length > 0 ? "border-foreground" : "border-border"} bg-card`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Owed now</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{owing.length > 0 ? fmtEGP(data.owedTotal) : "-"}</div>
                </div>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading && !data ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading...</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <CalendarClock className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-sm font-medium">Nothing recurring yet.</p>
                <p className="mt-1 text-[12px] text-muted-foreground">The gym on the 1st, a streaming bill on the 5th. Add one and it will tell you before it goes out.</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
                className="divide-y divide-border rounded-[10px] border border-border bg-card px-4"
              >
                {items.map((sub) => (
                  <SubscriptionRow
                    key={sub._id}
                    sub={sub}
                    busy={busyId === sub._id}
                    onEdit={() => {
                      setEditing(sub);
                      setAddOpen(true);
                    }}
                    onCharge={() => void act(sub, "charge")}
                    onSkip={() => void act(sub, "skip")}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SubscriptionDialog
        open={addOpen}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
          setAddOpen(next);
        }}
        wallets={wallets}
        banks={banks}
        externalSources={externalSources}
        editing={editing}
        onSaved={() => {
          void load();
          onChanged();
        }}
      />
    </>
  );
}
