import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { AxiosError } from "axios";
import { Landmark, Plus, Trash2, Users, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
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

type SourceType = "wallet" | "bank" | "external";

type Wallet = { _id: string; name: string };
type Bank = { _id: string; name: string; currency: "EGP" | "USD" };
type ExternalSource = { _id: string; name: string };

type Subscription = {
  _id: string;
  name: string;
  price: number;
  sourceType: SourceType;
  sourceId: string;
  sourceNameSnapshot: string;
  billingDay: number;
  archived: boolean;
};

type SourceSelection = { sourceType: SourceType; sourceId: string };

export interface SubscriptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  onChanged: () => void;
}

const fmtEGP = (n: number) =>
  `${Math.round(Math.abs(n)).toLocaleString("en-US")} L.E`;

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function encodeSource(type: SourceType, id: string) {
  return `${type}:${id}`;
}

function decodeSource(encoded: string): SourceSelection | null {
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
      <SelectTrigger className="w-full h-9">
        <SelectValue placeholder="Select source..." />
      </SelectTrigger>
      <SelectContent>
        {wallets.length > 0 && (
          <SelectGroup>
            <SelectLabel>
              <WalletIcon className="h-3 w-3 inline mr-1 opacity-60" />
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
              <Landmark className="h-3 w-3 inline mr-1 opacity-60" />
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
              <Users className="h-3 w-3 inline mr-1 opacity-60" />
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

function SubscriptionRow({ subscription, onEdit }: { subscription: Subscription; onEdit: (subscription: Subscription) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(subscription)}
      className="w-full flex items-center justify-between gap-3 py-2 px-1 hover:bg-muted/40 rounded-md transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-medium whitespace-nowrap shrink-0">
          Day {subscription.billingDay}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{subscription.name}</div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
            <SourceTypeIcon sourceType={subscription.sourceType} className="h-3 w-3 shrink-0" />
            <span className="truncate">{subscription.sourceNameSnapshot}</span>
          </div>
        </div>
      </div>
      <span className="text-sm font-semibold font-mono tabular-nums shrink-0">
        {fmtEGP(subscription.price)}
      </span>
    </button>
  );
}

interface AddSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  editing: Subscription | null;
  onSaved: () => void;
}

function AddSubscriptionDialog({
  open,
  onOpenChange,
  wallets,
  banks,
  externalSources,
  editing,
  onSaved,
}: AddSubscriptionDialogProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("");
  const [billingDay, setBillingDay] = useState("1");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setPrice(String(editing.price));
      setSource(encodeSource(editing.sourceType, editing.sourceId));
      setBillingDay(String(editing.billingDay));
    } else {
      setName("");
      setPrice("");
      setSource("");
      setBillingDay("1");
    }
  }, [open, editing]);

  const handleSubmit = async () => {
    const parsedPrice = parseFloat(price);
    const parsedBillingDay = parseInt(billingDay, 10);
    const decoded = decodeSource(source);

    if (!name.trim()) return toast.error("Name required");
    if (isNaN(parsedPrice) || parsedPrice < 0) return toast.error("Enter a valid price");
    if (!decoded) return toast.error("Select a source");
    if (!Number.isInteger(parsedBillingDay) || parsedBillingDay < 1 || parsedBillingDay > 31) {
      return toast.error("Billing day must be 1-31");
    }

    const payload = {
      name: name.trim(),
      price: parsedPrice,
      sourceType: decoded.sourceType,
      sourceId: decoded.sourceId,
      billingDay: parsedBillingDay,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/payments/subscriptions/${editing._id}`, payload);
        toast.success("Subscription saved");
      } else {
        await api.post("/payments/subscriptions", payload);
        toast.success("Subscription added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.delete(`/payments/subscriptions/${editing._id}`);
      toast.success("Subscription deleted");
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit subscription" : "Add subscription"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix, Spotify..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Price (L.E)</Label>
              <Input
                className="font-mono tabular-nums"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Source</Label>
              <SourcePicker
                wallets={wallets}
                banks={banks}
                externalSources={externalSources}
                value={source}
                onChange={setSource}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Billing day</Label>
              <Input
                className="font-mono tabular-nums"
                type="number"
                min="1"
                max="31"
                step="1"
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            {editing ? (
              <Button variant="ghost" size="default" onClick={() => setDeleteOpen(true)} disabled={saving}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <Button variant="default" size="default" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes it from the subscription reference list. No balances or expenses will change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SubscriptionsModal({
  open,
  onOpenChange,
  wallets,
  banks,
  externalSources,
  onChanged,
}: SubscriptionsModalProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<Subscription[]>("/payments/subscriptions");
      setSubscriptions(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadSubscriptions();
  }, [open, loadSubscriptions]);

  const handleSaved = () => {
    void loadSubscriptions();
    onChanged();
  };

  const handleAddOpenChange = (next: boolean) => {
    if (!next) setEditingSubscription(null);
    setAddOpen(next);
  };

  const sortedSubscriptions = [...subscriptions].sort((a, b) => a.billingDay - b.billingDay || a.name.localeCompare(b.name));
  const totalMonthly = sortedSubscriptions.reduce((sum, subscription) => sum + subscription.price, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <DialogTitle className="text-base font-medium">Subscriptions</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditingSubscription(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add subscription
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-border shrink-0">
            <div className="rounded-[10px] border border-border bg-card px-4 py-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Total monthly
                </div>
                <div className="text-xl font-semibold font-mono tabular-nums mt-1">
                  {fmtEGP(totalMonthly)} / month
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {sortedSubscriptions.length} {sortedSubscriptions.length === 1 ? "subscription" : "subscriptions"}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {loading && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading...
              </div>
            )}
            {!loading && sortedSubscriptions.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No subscriptions yet.
              </div>
            )}
            {!loading && sortedSubscriptions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
                className="rounded-[10px] border border-border bg-card px-4 divide-y divide-border"
              >
                {sortedSubscriptions.map((subscription, i) => (
                  <motion.div
                    key={subscription._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] as const }}
                  >
                    <SubscriptionRow
                      subscription={subscription}
                      onEdit={(next) => {
                        setEditingSubscription(next);
                        setAddOpen(true);
                      }}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddSubscriptionDialog
        open={addOpen}
        onOpenChange={handleAddOpenChange}
        wallets={wallets}
        banks={banks}
        externalSources={externalSources}
        editing={editingSubscription}
        onSaved={handleSaved}
      />
    </>
  );
}
