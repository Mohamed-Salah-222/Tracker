import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
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
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Pencil,
  Users,
  Plus,
  Trash2,
  Wallet as WalletIcon,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { AxiosError } from "axios";

// ===== Types =====
type MovementType =
  | "withdraw"
  | "deposit"
  | "transfer_bank"
  | "transfer_wallet"
  | "adjustment"
  | "family_in";

type Movement = {
  _id: string;
  type: MovementType;
  fromType: string | null;
  fromId: string | null;
  fromNameSnapshot: string | null;
  fromCurrencySnapshot: string | null;
  toType: string | null;
  toId: string | null;
  toNameSnapshot: string | null;
  toCurrencySnapshot: string | null;
  amountFrom: number;
  amountTo: number;
  conversionRate: number;
  date: string;
  note: string;
};

export type Wallet = { _id: string; name: string; balance: number };
export type Bank = { _id: string; name: string; balance: number; currency: "EGP" | "USD" };
export type ExternalSource = { _id: string; name: string };

// ===== Helpers =====
const fmtEGP = (n: number) =>
  `${Math.round(Math.abs(n)).toLocaleString("en-US")} L.E`;
const fmtUSD = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtAmount(amount: number, currency: string | null): string {
  if (currency === "USD") return fmtUSD(amount);
  return fmtEGP(amount);
}

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

function encodeAccount(type: "wallet" | "bank", id: string) {
  return `${type}:${id}`;
}

function decodeAccount(encoded: string): { type: "wallet" | "bank"; id: string } | null {
  const colon = encoded.indexOf(":");
  if (colon < 0) return null;
  const type = encoded.slice(0, colon) as "wallet" | "bank";
  const id = encoded.slice(colon + 1);
  if (!id) return null;
  return { type, id };
}

// ===== Movement type metadata =====
const MOVEMENT_TYPE_META: Record<
  MovementType,
  { label: string; icon: LucideIcon; colorVar: string }
> = {
  withdraw: { label: "Withdraw", icon: ArrowDownToLine, colorVar: "var(--color-expense)" },
  deposit: { label: "Deposit", icon: ArrowUpFromLine, colorVar: "var(--color-income)" },
  transfer_bank: { label: "Bank transfer", icon: ArrowLeftRight, colorVar: "var(--color-muted-foreground)" },
  transfer_wallet: { label: "Wallet transfer", icon: ArrowLeftRight, colorVar: "var(--color-muted-foreground)" },
  adjustment: { label: "Adjustment", icon: Pencil, colorVar: "var(--color-muted-foreground)" },
  family_in: { label: "Family in", icon: Users, colorVar: "var(--color-income)" },
};

const ALL_TYPES: MovementType[] = [
  "withdraw",
  "deposit",
  "transfer_bank",
  "transfer_wallet",
  "adjustment",
  "family_in",
];

// ===== MovementTypePill =====
function MovementTypePill({ type }: { type: MovementType }) {
  const meta = MOVEMENT_TYPE_META[type];
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap shrink-0"
      style={{
        color: meta.colorVar,
        background: `color-mix(in oklch, ${meta.colorVar}, transparent 85%)`,
        borderColor: `color-mix(in oklch, ${meta.colorVar}, transparent 70%)`,
      }}
    >
      {meta.label}
    </span>
  );
}

// ===== Amount display in log row =====
function MovementAmountDisplay({ mov }: { mov: Movement }) {
  const fc = mov.fromCurrencySnapshot;
  const tc = mov.toCurrencySnapshot;

  if (mov.type === "adjustment") {
    const currency = fc ?? tc ?? null;
    const sign = mov.amountFrom >= 0 ? "+" : "−";
    return (
      <span
        className="text-sm font-semibold font-mono tabular-nums shrink-0"
        style={{ color: mov.amountFrom >= 0 ? "var(--color-income)" : "var(--color-expense)" }}
      >
        {sign}
        {fmtAmount(Math.abs(mov.amountFrom), currency)}
      </span>
    );
  }

  if (fc && tc && fc !== tc) {
    return (
      <div className="text-right shrink-0">
        <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
          {fmtAmount(mov.amountFrom, fc)}
        </div>
        <div className="text-sm font-semibold font-mono tabular-nums">
          {fmtAmount(mov.amountTo, tc)}
        </div>
      </div>
    );
  }

  const currency = tc ?? fc ?? null;
  const amount = mov.type === "family_in" ? mov.amountTo : mov.amountFrom;
  const color =
    mov.type === "family_in" || mov.type === "deposit"
      ? "var(--color-income)"
      : "var(--color-muted-foreground)";

  return (
    <span className="text-sm font-semibold font-mono tabular-nums shrink-0" style={{ color }}>
      {fmtAmount(amount, currency)}
    </span>
  );
}

// ===== MovementRow =====
function MovementRow({ mov, onEdit }: { mov: Movement; onEdit: (m: Movement) => void }) {
  const isAdjustment = mov.type === "adjustment";
  const summary = isAdjustment
    ? (mov.fromNameSnapshot ?? mov.toNameSnapshot ?? "—")
    : `${mov.fromNameSnapshot ?? "—"} → ${mov.toNameSnapshot ?? "—"}`;

  return (
    <button
      type="button"
      onClick={() => onEdit(mov)}
      className="w-full flex items-center justify-between py-2 px-1 hover:bg-muted/40 rounded-md transition-colors text-left cursor-pointer gap-3"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <MovementTypePill type={mov.type} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{summary}</div>
          {mov.note && (
            <div className="text-xs text-muted-foreground truncate">{mov.note}</div>
          )}
        </div>
      </div>
      <MovementAmountDisplay mov={mov} />
    </button>
  );
}

// ===== AddMovementDialog =====
interface AddMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  editing: Movement | null;
  onSaved: () => void;
}

function AddMovementDialog({
  open,
  onOpenChange,
  wallets,
  banks,
  externalSources,
  editing,
  onSaved,
}: AddMovementDialogProps) {
  const [step, setStep] = useState<"pick-type" | "form">("pick-type");
  const [selType, setSelType] = useState<MovementType>("withdraw");

  // Per-type account selections
  const [fromBankId, setFromBankId] = useState("");
  const [toBankId, setToBankId] = useState("");
  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [adjustAccount, setAdjustAccount] = useState("");
  const [familyTarget, setFamilyTarget] = useState("");

  const [amountFrom, setAmountFrom] = useState("");
  const [conversionRate, setConversionRate] = useState("50");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSelType(editing.type);
      setStep("form");
      setAmountFrom(String(editing.amountFrom));
      setConversionRate(String(editing.conversionRate));
      setDate(editing.date.slice(0, 10));
      setNote(editing.note ?? "");
      const fid = editing.fromId ?? "";
      const tid = editing.toId ?? "";
      setFromBankId("");
      setToBankId("");
      setFromWalletId("");
      setToWalletId("");
      setExternalId("");
      setAdjustAccount("");
      setFamilyTarget("");
      switch (editing.type) {
        case "withdraw":
          setFromBankId(fid);
          setToWalletId(tid);
          break;
        case "deposit":
          setFromWalletId(fid);
          setToBankId(tid);
          break;
        case "transfer_bank":
          setFromBankId(fid);
          setToBankId(tid);
          break;
        case "transfer_wallet":
          setFromWalletId(fid);
          setToWalletId(tid);
          break;
        case "adjustment":
          if (fid && editing.fromType)
            setAdjustAccount(encodeAccount(editing.fromType as "wallet" | "bank", fid));
          break;
        case "family_in":
          setExternalId(fid);
          if (tid && editing.toType)
            setFamilyTarget(encodeAccount(editing.toType as "wallet" | "bank", tid));
          break;
      }
    } else {
      setStep("pick-type");
      setSelType("withdraw");
      setFromBankId("");
      setToBankId("");
      setFromWalletId("");
      setToWalletId("");
      setExternalId("");
      setAdjustAccount("");
      setFamilyTarget("");
      setAmountFrom("");
      setConversionRate("50");
      setDate(todayISO());
      setNote("");
    }
  }, [open, editing]);

  const pickType = (t: MovementType) => {
    setSelType(t);
    setStep("form");
    setFromBankId("");
    setToBankId("");
    setFromWalletId("");
    setToWalletId("");
    setExternalId("");
    setAdjustAccount("");
    setFamilyTarget("");
    setConversionRate("50");
  };

  // Currency of selected accounts
  const fromBankCurrency = banks.find((b) => b._id === fromBankId)?.currency ?? "EGP";
  const toBankCurrency = banks.find((b) => b._id === toBankId)?.currency ?? "EGP";

  const showConversion =
    (selType === "withdraw" && fromBankCurrency === "USD") ||
    (selType === "deposit" && !!toBankId && toBankCurrency !== "EGP") ||
    (selType === "transfer_bank" && !!fromBankId && !!toBankId && fromBankCurrency !== toBankCurrency);

  const fromCurrencyLabel =
    selType === "deposit" ? "EGP" : fromBankCurrency;
  const toCurrencyLabel =
    selType === "withdraw" ? "EGP" : selType === "deposit" ? toBankCurrency : toBankCurrency;

  const computedAmountTo = (() => {
    const af = parseFloat(amountFrom);
    const cr = parseFloat(conversionRate);
    if (isNaN(af) || isNaN(cr) || cr <= 0) return "";
    return (af * cr).toFixed(2);
  })();

  const handleSubmit = async () => {
    const af = parseFloat(amountFrom);
    if (!amountFrom || isNaN(af)) return toast.error("Enter an amount");
    if (!date) return toast.error("Date required");
    if (selType !== "adjustment" && af <= 0) return toast.error("Amount must be positive");
    if (selType === "adjustment" && af === 0) return toast.error("Adjustment amount cannot be zero");

    type Payload = Record<string, unknown>;
    const base: Payload = { type: selType, date, note };

    let payload: Payload;

    switch (selType) {
      case "withdraw": {
        if (!fromBankId) return toast.error("Select source bank");
        if (!toWalletId) return toast.error("Select target wallet");
        const rate = showConversion ? parseFloat(conversionRate) : 1;
        const at = showConversion ? parseFloat(computedAmountTo) : af;
        if (showConversion && (isNaN(rate) || rate <= 0)) return toast.error("Enter a valid conversion rate");
        payload = { ...base, fromType: "bank", fromId: fromBankId, toType: "wallet", toId: toWalletId, amountFrom: af, amountTo: at, conversionRate: rate };
        break;
      }
      case "deposit": {
        if (!fromWalletId) return toast.error("Select source wallet");
        if (!toBankId) return toast.error("Select target bank");
        const rate = showConversion ? parseFloat(conversionRate) : 1;
        const at = showConversion ? parseFloat(computedAmountTo) : af;
        if (showConversion && (isNaN(rate) || rate <= 0)) return toast.error("Enter a valid conversion rate");
        payload = { ...base, fromType: "wallet", fromId: fromWalletId, toType: "bank", toId: toBankId, amountFrom: af, amountTo: at, conversionRate: rate };
        break;
      }
      case "transfer_bank": {
        if (!fromBankId) return toast.error("Select source bank");
        if (!toBankId) return toast.error("Select target bank");
        if (fromBankId === toBankId) return toast.error("Source and target banks must differ");
        const rate = showConversion ? parseFloat(conversionRate) : 1;
        const at = showConversion ? parseFloat(computedAmountTo) : af;
        if (showConversion && (isNaN(rate) || rate <= 0)) return toast.error("Enter a valid conversion rate");
        payload = { ...base, fromType: "bank", fromId: fromBankId, toType: "bank", toId: toBankId, amountFrom: af, amountTo: at, conversionRate: rate };
        break;
      }
      case "transfer_wallet": {
        if (!fromWalletId) return toast.error("Select source wallet");
        if (!toWalletId) return toast.error("Select target wallet");
        if (fromWalletId === toWalletId) return toast.error("Source and target wallets must differ");
        payload = { ...base, fromType: "wallet", fromId: fromWalletId, toType: "wallet", toId: toWalletId, amountFrom: af, amountTo: af, conversionRate: 1 };
        break;
      }
      case "adjustment": {
        if (!adjustAccount) return toast.error("Select account to adjust");
        const decoded = decodeAccount(adjustAccount);
        if (!decoded) return toast.error("Invalid account selection");
        payload = { ...base, fromType: decoded.type, fromId: decoded.id, toType: null, toId: null, amountFrom: af, amountTo: af, conversionRate: 1 };
        break;
      }
      case "family_in": {
        if (!externalId) return toast.error("Select family source");
        if (!familyTarget) return toast.error("Select target account");
        const decoded = decodeAccount(familyTarget);
        if (!decoded) return toast.error("Invalid account selection");
        payload = { ...base, fromType: "external", fromId: externalId, toType: decoded.type, toId: decoded.id, amountFrom: af, amountTo: af, conversionRate: 1 };
        break;
      }
      default:
        return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/payments/movements/${editing._id}`, payload);
        toast.success("Movement updated");
      } else {
        await api.post("/payments/movements", payload);
        toast.success("Movement logged");
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
      await api.delete(`/payments/movements/${editing._id}`);
      toast.success("Movement deleted");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "text-[10px] uppercase tracking-wider text-muted-foreground font-medium";
  const fh = "h-9";

  const conversionRow = showConversion ? (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className={labelCls}>
          Rate (1 {fromCurrencyLabel} = X {toCurrencyLabel})
        </Label>
        <Input
          className={`${fh} font-mono tabular-nums`}
          type="number"
          step="any"
          value={conversionRate}
          onChange={(e) => setConversionRate(e.target.value)}
          placeholder="e.g. 50"
        />
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Received ({toCurrencyLabel})</Label>
        <Input
          className={`${fh} font-mono tabular-nums bg-muted/50`}
          readOnly
          value={computedAmountTo}
          placeholder="auto"
        />
      </div>
    </div>
  ) : null;

  const amountField = (
    <div className="space-y-1.5">
      <Label className={labelCls}>
        {selType === "adjustment" ? "Amount (use − for losses)" : "Amount"}
      </Label>
      <Input
        className={`${fh} font-mono tabular-nums`}
        type="number"
        step="any"
        value={amountFrom}
        onChange={(e) => setAmountFrom(e.target.value)}
        placeholder={selType === "adjustment" ? "e.g. 500 or -200" : "0"}
      />
      {selType === "adjustment" && (
        <p className="text-xs text-muted-foreground">Positive = gain, negative = loss.</p>
      )}
    </div>
  );

  const renderForm = () => {
    switch (selType) {
      case "withdraw":
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>From (bank)</Label>
                <Select value={fromBankId} onValueChange={(v) => setFromBankId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select bank…" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.name} ({b.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>To (wallet)</Label>
                <Select value={toWalletId} onValueChange={(v) => setToWalletId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select wallet…" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w._id} value={w._id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {amountField}
            {conversionRow}
          </>
        );

      case "deposit":
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>From (wallet)</Label>
                <Select value={fromWalletId} onValueChange={(v) => setFromWalletId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select wallet…" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w._id} value={w._id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>To (bank)</Label>
                <Select value={toBankId} onValueChange={(v) => setToBankId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select bank…" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.name} ({b.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {amountField}
            {conversionRow}
          </>
        );

      case "transfer_bank":
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>From (bank)</Label>
                <Select value={fromBankId} onValueChange={(v) => setFromBankId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select bank…" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks
                      .filter((b) => b._id !== toBankId)
                      .map((b) => (
                        <SelectItem key={b._id} value={b._id}>
                          {b.name} ({b.currency})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>To (bank)</Label>
                <Select value={toBankId} onValueChange={(v) => setToBankId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select bank…" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks
                      .filter((b) => b._id !== fromBankId)
                      .map((b) => (
                        <SelectItem key={b._id} value={b._id}>
                          {b.name} ({b.currency})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {amountField}
            {conversionRow}
          </>
        );

      case "transfer_wallet":
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>From (wallet)</Label>
                <Select value={fromWalletId} onValueChange={(v) => setFromWalletId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select wallet…" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets
                      .filter((w) => w._id !== toWalletId)
                      .map((w) => (
                        <SelectItem key={w._id} value={w._id}>
                          {w.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>To (wallet)</Label>
                <Select value={toWalletId} onValueChange={(v) => setToWalletId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select wallet…" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets
                      .filter((w) => w._id !== fromWalletId)
                      .map((w) => (
                        <SelectItem key={w._id} value={w._id}>
                          {w.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {amountField}
          </>
        );

      case "adjustment":
        return (
          <>
            <div className="space-y-1.5">
              <Label className={labelCls}>Account</Label>
              <Select value={adjustAccount} onValueChange={(v) => setAdjustAccount(v ?? "")}>
                <SelectTrigger className={`w-full ${fh}`}>
                  <SelectValue placeholder="Select account…" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>
                        <WalletIcon className="h-3 w-3 inline mr-1 opacity-60" />
                        Wallets
                      </SelectLabel>
                      {wallets.map((w) => (
                        <SelectItem key={w._id} value={encodeAccount("wallet", w._id)}>
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
                        <SelectItem key={b._id} value={encodeAccount("bank", b._id)}>
                          {b.name} ({b.currency})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            {amountField}
          </>
        );

      case "family_in":
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>From (family)</Label>
                <Select value={externalId} onValueChange={(v) => setExternalId(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select person…" />
                  </SelectTrigger>
                  <SelectContent>
                    {externalSources.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>To (your account)</Label>
                <Select value={familyTarget} onValueChange={(v) => setFamilyTarget(v ?? "")}>
                  <SelectTrigger className={`w-full ${fh}`}>
                    <SelectValue placeholder="Select account…" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Wallets</SelectLabel>
                        {wallets.map((w) => (
                          <SelectItem key={w._id} value={encodeAccount("wallet", w._id)}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {wallets.length > 0 && banks.length > 0 && <SelectSeparator />}
                    {banks.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Banks</SelectLabel>
                        {banks.map((b) => (
                          <SelectItem key={b._id} value={encodeAccount("bank", b._id)}>
                            {b.name} ({b.currency})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {amountField}
          </>
        );

      default:
        return null;
    }
  };

  const title = editing
    ? "Edit movement"
    : step === "pick-type"
    ? "Add movement"
    : MOVEMENT_TYPE_META[selType].label;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {step === "pick-type" ? (
            <div className="grid grid-cols-2 gap-2">
              {ALL_TYPES.map((t) => {
                const meta = MOVEMENT_TYPE_META[t];
                const Icon = meta.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => pickType(t)}
                    className="flex items-center gap-2.5 rounded-[10px] border border-border p-3 text-left hover:bg-accent hover:border-border-strong transition-all"
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: meta.colorVar }} />
                    <span className="text-sm font-medium">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {editing && (
                <button
                  type="button"
                  onClick={() => setStep("pick-type")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  Change type
                </button>
              )}
              {renderForm()}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelCls}>Date</Label>
                  <Input
                    className={fh}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Note</Label>
                  <Input
                    className={fh}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional…"
                  />
                </div>
              </div>
            </div>
          )}

          {step === "form" && (
            <DialogFooter className="flex justify-between sm:justify-between">
              {editing ? (
                <Button variant="ghost" size="default" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              ) : (
                <div />
              )}
              <Button variant="default" size="default" onClick={handleSubmit} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save" : "Log movement"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this movement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the balance effect on the accounts involved.
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

// ===== MovementsModal (outer modal) =====
export interface MovementsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  onChanged: () => void;
}

export function MovementsModal({
  open,
  onOpenChange,
  wallets,
  banks,
  externalSources,
  onChanged,
}: MovementsModalProps) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<MovementType | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterType !== "all") params.type = filterType;
      const r = await api.get<Movement[]>("/payments/movements", { params });
      setMovements(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    if (open) void loadMovements();
  }, [open, loadMovements]);

  const handleSaved = () => {
    void loadMovements();
    onChanged();
  };

  const handleEdit = (mov: Movement) => {
    setEditingMovement(mov);
    setAddOpen(true);
  };

  const handleAddOpenChange = (next: boolean) => {
    if (!next) setEditingMovement(null);
    setAddOpen(next);
  };

  // Group by date
  const grouped: Record<string, Movement[]> = {};
  for (const m of movements) {
    const k = m.date.slice(0, 10);
    (grouped[k] ||= []).push(m);
  }
  const groupKeys = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));
  const todayStr = todayISO();

  const filterOptions: Array<MovementType | "all"> = ["all", ...ALL_TYPES];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <DialogTitle className="text-base font-medium">Money movements</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditingMovement(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add movement
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

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-border overflow-x-auto shrink-0">
            {filterOptions.map((t) => {
              const active = filterType === t;
              const label = t === "all" ? "All" : MOVEMENT_TYPE_META[t].label;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterType(t)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                    active
                      ? "border-foreground/30 bg-foreground/10 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
            {loading && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading…
              </div>
            )}
            {!loading && movements.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No movements yet.
              </div>
            )}
            {!loading &&
              groupKeys.map((dayKey, gi) => {
                const items = grouped[dayKey];
                const isToday = dayKey === todayStr;
                return (
                  <motion.div
                    key={dayKey}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: gi * 0.04,
                      ease: [0.16, 1, 0.3, 1] as const,
                    }}
                  >
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-xs font-semibold">
                        {new Date(dayKey).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                      {isToday && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="rounded-[10px] border border-border bg-card px-4 divide-y divide-border">
                      {items.map((m) => (
                        <MovementRow key={m._id} mov={m} onEdit={handleEdit} />
                      ))}
                    </div>
                  </motion.div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      <AddMovementDialog
        open={addOpen}
        onOpenChange={handleAddOpenChange}
        wallets={wallets}
        banks={banks}
        externalSources={externalSources}
        editing={editingMovement}
        onSaved={handleSaved}
      />
    </>
  );
}
