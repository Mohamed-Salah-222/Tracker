import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, Plus, Search, BarChart3, Calendar, Wallet as WalletIcon, Check, Landmark, Users, ChevronDown, ArrowLeftRight, Repeat, ShoppingBag } from "lucide-react";
import { AxiosError } from "axios";
import { RecapModal } from "../components/RecapModal";
import { MovementsModal } from "../components/MovementsModal";
import { SubscriptionsModal } from "../components/SubscriptionsModal";
import { WishlistModal } from "../components/WishlistModal";

// ===== Types =====
type Wallet = { _id: string; name: string; balance: number };
type BankCurrency = "EGP" | "USD";
type Bank = { _id: string; name: string; balance: number; currency: BankCurrency };
type ExternalSource = { _id: string; name: string };
type Category = "food" | "transport" | "bills" | "shopping" | "entertainment" | "health" | "education" | "other";
type SourceType = "wallet" | "bank" | "external";
type SourceSelection = { sourceType: SourceType; sourceId: string };
type Expense = {
  _id: string;
  name: string;
  amount: number;
  category: Category;
  sourceType: SourceType;
  sourceId: string;
  sourceNameSnapshot: string;
  date: string;
};

const CATEGORIES: Category[] = ["food", "transport", "bills", "shopping", "entertainment", "health", "education", "other"];
const BANK_CURRENCIES: BankCurrency[] = ["EGP", "USD"];

// ===== Helpers =====
const fmtEGP = (n: number) => `${Math.round(n).toLocaleString("en-US")} L.E`;
const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

// ===== Motion =====
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

// ===== Category tag =====
function CategoryTag({ category, size = "sm" }: { category: Category; size?: "xs" | "sm" }) {
  return (
    <span
      className={`font-medium capitalize rounded border ${size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"}`}
      style={{
        color: `var(--color-cat-${category})`,
        background: `var(--color-cat-${category}-bg)`,
        borderColor: `color-mix(in oklch, var(--color-cat-${category}), transparent 70%)`,
      }}
    >
      {category}
    </span>
  );
}

// ===== Source type icon =====
function SourceTypeIcon({ sourceType, className = "h-3.5 w-3.5" }: { sourceType: SourceType; className?: string }) {
  if (sourceType === "bank") return <Landmark className={className} />;
  if (sourceType === "external") return <Users className={className} />;
  return <WalletIcon className={className} />;
}

// ===== Source pill =====
function SourcePill({ sourceType, name, size = "sm" }: { sourceType: SourceType; name: string; size?: "xs" | "sm" }) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded border border-foreground/40 text-foreground/80 ${size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"}`}>
      <SourceTypeIcon sourceType={sourceType} className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {name}
    </span>
  );
}

// ===== Source picker (dialog-based) =====
function SourcePicker({
  wallets,
  banks,
  externalSources,
  value,
  onChange,
  placeholder = "Pick source",
  triggerClassName = "",
}: {
  wallets: Wallet[];
  banks: Bank[];
  externalSources: ExternalSource[];
  value: SourceSelection | null;
  onChange: (s: SourceSelection) => void;
  placeholder?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  const label = value
    ? (() => {
        if (value.sourceType === "wallet") return wallets.find((w) => w._id === value.sourceId)?.name ?? placeholder;
        if (value.sourceType === "bank") return banks.find((b) => b._id === value.sourceId)?.name ?? placeholder;
        return externalSources.find((s) => s._id === value.sourceId)?.name ?? placeholder;
      })()
    : placeholder;

  const pick = (s: SourceSelection) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${triggerClassName}`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {value && <SourceTypeIcon sourceType={value.sourceType} className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
          <span className={value ? "" : "text-muted-foreground"}>{label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-sm">Select source</DialogTitle>
          </DialogHeader>
          <div className="pb-3 max-h-80 overflow-y-auto">
            {wallets.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                  <WalletIcon className="h-3 w-3" /> Wallets
                </div>
                {wallets.map((w) => (
                  <button key={w._id} type="button" onClick={() => pick({ sourceType: "wallet", sourceId: w._id })} className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center justify-between">
                    <span>{w.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{fmtEGP(w.balance)}</span>
                  </button>
                ))}
              </div>
            )}
            {banks.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5 mt-1">
                  <Landmark className="h-3 w-3" /> Banks
                </div>
                {banks.map((b) => (
                  <button key={b._id} type="button" onClick={() => pick({ sourceType: "bank", sourceId: b._id })} className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center justify-between">
                    <span>{b.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{b.currency === "USD" ? fmtUSD(b.balance) : fmtEGP(b.balance)}</span>
                  </button>
                ))}
              </div>
            )}
            {externalSources.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5 mt-1">
                  <Users className="h-3 w-3" /> Family money
                </div>
                {externalSources.map((s) => (
                  <button key={s._id} type="button" onClick={() => pick({ sourceType: "external", sourceId: s._id })} className="w-full text-left px-4 py-2 text-sm hover:bg-accent">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function Payments() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSourceId, setFilterSourceId] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [recapPeriod, setRecapPeriod] = useState<"week" | "month" | null>(null);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);

  const loadWallets = useCallback(async () => {
    try {
      const r = await api.get<Wallet[]>("/payments/wallets");
      setWallets(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadBanks = useCallback(async () => {
    try {
      const r = await api.get<Bank[]>("/payments/banks");
      setBanks(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadExternalSources = useCallback(async () => {
    try {
      const r = await api.get<ExternalSource[]>("/payments/external-sources");
      setExternalSources(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterCategory !== "all") params.category = filterCategory;
      if (filterSourceId !== "all") params.sourceId = filterSourceId;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const r = await api.get<Expense[]>("/payments/expenses", { params });
      setExpenses(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [search, filterCategory, filterSourceId, filterFrom, filterTo]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    void loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    void loadExternalSources();
  }, [loadExternalSources]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const reloadAll = () => {
    void loadWallets();
    void loadBanks();
    void loadExternalSources();
    void loadExpenses();
  };

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  const grouped: Record<string, Expense[]> = {};
  for (const e of expenses) {
    const k = e.date.slice(0, 10);
    (grouped[k] ||= []).push(e);
  }
  const groupKeys = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  const hasActiveFilters = !!search || filterCategory !== "all" || filterSourceId !== "all" || !!filterFrom || !!filterTo;
  const clearFilters = () => {
    setSearch("");
    setFilterCategory("all");
    setFilterSourceId("all");
    setFilterFrom("");
    setFilterTo("");
  };

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Payments</h1>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button variant="outline" size="sm" onClick={() => setMovementsOpen(true)}>
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
            Movements
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSubscriptionsOpen(true)}>
            <Repeat className="h-3.5 w-3.5 mr-1.5" />
            Subscriptions
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWishlistOpen(true)}>
            <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
            Wishlist
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRecapPeriod("week")}>
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Weekly recap
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRecapPeriod("month")}>
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Monthly recap
          </Button>
        </div>
      </motion.div>

      {/* ===== Total balance headline ===== */}
      <motion.div {...stagger(1)} className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Wallets</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total balance</div>
          <div className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums" style={{ color: totalBalance > 0 ? "var(--color-income)" : "var(--color-muted-foreground)" }}>
            {fmtEGP(totalBalance)}
          </div>
        </div>
      </motion.div>

      {/* ===== Wallets grid ===== */}
      <motion.div {...stagger(2)} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {wallets.map((w, i) => (
          <WalletCard key={w._id} wallet={w} onChanged={reloadAll} index={i} />
        ))}
        <AddWalletCard onAdded={loadWallets} />
      </motion.div>

      {/* ===== Banks header ===== */}
      <motion.div {...stagger(2)} className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Banks</span>
        </div>
        <div className="flex items-end gap-6">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total EGP</div>
            <div className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums">
              {fmtEGP(banks.filter((b) => b.currency === "EGP").reduce((s, b) => s + b.balance, 0))}
            </div>
          </div>
          {banks.some((b) => b.currency === "USD") && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total USD</div>
              <div className="text-2xl md:text-3xl font-semibold font-mono tracking-tight tabular-nums">
                {fmtUSD(banks.filter((b) => b.currency === "USD").reduce((s, b) => s + b.balance, 0))}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ===== Banks grid ===== */}
      <motion.div {...stagger(2)} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {banks.map((b, i) => (
          <BankCard key={b._id} bank={b} onChanged={loadBanks} index={i} />
        ))}
        <AddBankCard onAdded={loadBanks} />
      </motion.div>

      {/* ===== Family money header ===== */}
      <motion.div {...stagger(3)} className="space-y-1">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Family money</span>
        </div>
        <p className="text-xs text-muted-foreground">People who pay for things. No balance tracking.</p>
      </motion.div>

      {/* ===== Family money grid ===== */}
      <motion.div {...stagger(3)} className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {externalSources.map((s, i) => (
          <ExternalSourceCard key={s._id} source={s} onChanged={loadExternalSources} index={i} />
        ))}
        <AddExternalSourceCard onAdded={loadExternalSources} />
      </motion.div>

      {/* ===== Add expense ===== */}
      <AddExpenseForm wallets={wallets} banks={banks} externalSources={externalSources} onAdded={reloadAll} />

      {/* ===== History section header + filters toggle ===== */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-sm font-semibold tracking-tight">History</h2>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
            Clear filters
          </Button>
        )}
      </div>

      {/* ===== Filters ===== */}
      <motion.div {...stagger(3)}>
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Category</Label>
                <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Source</Label>
                <Select value={filterSourceId} onValueChange={(v) => setFilterSourceId(v ?? "all")}>
                  <SelectTrigger className="w-full !h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {wallets.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Wallets</SelectLabel>
                        {wallets.map((w) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                      </SelectGroup>
                    )}
                    {banks.length > 0 && (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Banks</SelectLabel>
                          {banks.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                        </SelectGroup>
                      </>
                    )}
                    {externalSources.length > 0 && (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Family money</SelectLabel>
                          {externalSources.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">From</Label>
                <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">To</Label>
                <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== History list ===== */}
      <div className="space-y-3">
        {groupKeys.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-sm text-muted-foreground">No expenses match.</div>
            </CardContent>
          </Card>
        )}
        {groupKeys.map((dayKey, gi) => {
          const items = grouped[dayKey];
          const dayTotal = items.reduce((s, e) => s + e.amount, 0);
          const isToday = dayKey === todayISO();
          return (
            <motion.div key={dayKey} {...stagger(gi + 4)}>
              <Card>
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-border">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold">
                        {new Date(dayKey).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                      {isToday && <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Today</span>}
                    </div>
                    <div className="text-sm font-semibold font-mono tabular-nums" style={{ color: "var(--color-expense)" }}>
                      {fmtEGP(dayTotal)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {items.map((e) => (
                      <ExpenseRow key={e._id} expense={e} wallets={wallets} banks={banks} externalSources={externalSources} onChanged={reloadAll} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ===== Recap modal ===== */}
      <RecapModal open={recapPeriod !== null} onOpenChange={(o) => !o && setRecapPeriod(null)} period={recapPeriod ?? "week"} />

      {/* ===== Movements modal ===== */}
      <MovementsModal open={movementsOpen} onOpenChange={setMovementsOpen} wallets={wallets} banks={banks} externalSources={externalSources} onChanged={reloadAll} />

      {/* ===== Subscriptions modal ===== */}
      <SubscriptionsModal open={subscriptionsOpen} onOpenChange={setSubscriptionsOpen} wallets={wallets} banks={banks} externalSources={externalSources} onChanged={reloadAll} />

      {/* ===== Wishlist modal ===== */}
      <WishlistModal open={wishlistOpen} onOpenChange={setWishlistOpen} onChanged={reloadAll} />
    </div>
  );
}

// =====================================================================
// WalletCard
// =====================================================================
function WalletCard({ wallet, onChanged, index }: { wallet: Wallet; onChanged: () => void; index: number }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(wallet.name);
  const [balance, setBalance] = useState(wallet.balance.toString());

  const handleEditOpen = (next: boolean) => {
    if (next) {
      setName(wallet.name);
      setBalance(wallet.balance.toString());
    }
    setEditOpen(next);
  };

  const save = async () => {
    const b = parseFloat(balance);
    if (!name.trim() || isNaN(b)) return toast.error("Invalid input");
    try {
      await api.patch(`/payments/wallets/${wallet._id}`, {
        name: name.trim(),
        balance: b,
      });
      toast.success("Saved");
      setEditOpen(false);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async () => {
    try {
      await api.delete(`/payments/wallets/${wallet._id}`);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => handleEditOpen(true)}
        className="text-left rounded-[10px] border border-border bg-card p-4 hover:border-border-strong hover:shadow-md transition-all relative overflow-hidden"
      >
        <div className="text-xs text-muted-foreground truncate font-medium">{wallet.name}</div>
        <div className="text-xl font-semibold font-mono tracking-tight tabular-nums mt-2">{fmtEGP(wallet.balance)}</div>
      </motion.button>

      <Dialog open={editOpen} onOpenChange={handleEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Balance (L.E)</Label>
              <Input type="number" step="1" value={balance} onChange={(e) => setBalance(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">Use this to manually correct or top up.</p>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="default"
              onClick={() => {
                setEditOpen(false);
                setDeleteOpen(true);
              }}
            >
              Delete
            </Button>
            <Button variant="default" size="default" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{wallet.name}"?</AlertDialogTitle>
            <AlertDialogDescription>The wallet is archived. Past expenses keep its name in history.</AlertDialogDescription>
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

// =====================================================================
// AddWalletCard
// =====================================================================
function AddWalletCard({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("0");

  const handleOpen = (next: boolean) => {
    if (next) {
      setName("");
      setBalance("0");
    }
    setOpen(next);
  };

  const save = async () => {
    const b = parseFloat(balance);
    if (!name.trim() || isNaN(b)) return toast.error("Invalid input");
    try {
      await api.post("/payments/wallets", { name: name.trim(), balance: b });
      toast.success("Added");
      setOpen(false);
      onAdded();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <>
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.16 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => handleOpen(true)}
        className="rounded-[10px] border-2 border-dashed border-border p-4 hover:border-border-strong hover:bg-muted/50 transition-all flex items-center justify-center min-h-[80px] text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        <span className="text-sm font-medium">Add wallet</span>
      </motion.button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CIB Visa, Vodafone Cash, Cash..." />
            </div>
            <div className="space-y-1.5">
              <Label>Starting balance (L.E)</Label>
              <Input type="number" step="1" value={balance} onChange={(e) => setBalance(e.target.value)} className="font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="default" size="default" onClick={save}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// AddExpenseForm
// =====================================================================
function AddExpenseForm({ wallets, banks, externalSources, onAdded }: { wallets: Wallet[]; banks: Bank[]; externalSources: ExternalSource[]; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [source, setSource] = useState<SourceSelection | null>(null);
  const [date, setDate] = useState(todayISO());

  const save = async (originBtn: HTMLElement | null) => {
    const amt = parseFloat(amount);
    if (!name.trim()) return toast.error("Name required");
    if (!amt || amt <= 0) return toast.error("Amount > 0");
    if (!source) return toast.error("Pick a source");
    try {
      await api.post("/payments/expenses", {
        name: name.trim(),
        amount: amt,
        category,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        date,
      });
      toast.success(`Logged ${fmtEGP(amt)}`);
      if (originBtn) spawnExpenseFlash(originBtn);
      setName("");
      setAmount("");
      onAdded();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const labelCls = "text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1.5 h-4";
  const fieldHeight = "h-8";

  return (
    <motion.div {...stagger(3)}>
      <Card>
        <CardContent className="p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
            <Plus className="h-3 w-3" />
            Log expense
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1.2fr_1.2fr_1fr] gap-3">
            {/* Name */}
            <div>
              <Label className={labelCls}>Name</Label>
              <Input className={fieldHeight} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lunch, Uber..." />
            </div>

            {/* Amount */}
            <div>
              <Label className={labelCls}>Amount</Label>
              <Input className={`${fieldHeight} font-mono tabular-nums`} type="number" step="1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>

            {/* Category */}
            <div>
              <Label className={labelCls}>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory((v ?? "food") as Category)}>
                <SelectTrigger className={`w-full capitalize ${fieldHeight} !h-8`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div>
              <Label className={labelCls}>Source</Label>
              <SourcePicker
                wallets={wallets}
                banks={banks}
                externalSources={externalSources}
                value={source}
                onChange={setSource}
                placeholder="Pick source"
                triggerClassName={`w-full ${fieldHeight} !h-8`}
              />
            </div>

            {/* Date */}
            <div>
              <Label className={labelCls}>Date</Label>
              <Input className={fieldHeight} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <Button variant="default" size="default" onClick={(e) => save(e.currentTarget)} className="w-full h-8 mt-4">
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Save
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Subtle flash animation on expense log (less celebratory than income confetti)
function spawnExpenseFlash(originEl: HTMLElement) {
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed;
    left: ${cx}px;
    top: ${cy}px;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--color-expense);
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
    transition: transform 500ms cubic-bezier(0.4, 0, 0.6, 1), opacity 500ms ease-out;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = `translate(-50%, -50%) scale(8)`;
    el.style.opacity = "0";
  });
  setTimeout(() => el.remove(), 550);
}

// =====================================================================
// BankCard
// =====================================================================
function BankCard({ bank, onChanged, index }: { bank: Bank; onChanged: () => void; index: number }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(bank.name);
  const [balance, setBalance] = useState(bank.balance.toString());
  const [currency, setCurrency] = useState<BankCurrency>(bank.currency);

  const handleEditOpen = (next: boolean) => {
    if (next) {
      setName(bank.name);
      setBalance(bank.balance.toString());
      setCurrency(bank.currency);
    }
    setEditOpen(next);
  };

  const save = async () => {
    const b = parseFloat(balance);
    if (!name.trim() || isNaN(b)) return toast.error("Invalid input");
    try {
      await api.patch(`/payments/banks/${bank._id}`, { name: name.trim(), balance: b, currency });
      toast.success("Saved");
      setEditOpen(false);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async () => {
    try {
      await api.delete(`/payments/banks/${bank._id}`);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const fmt = bank.currency === "USD" ? fmtUSD : fmtEGP;

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => handleEditOpen(true)}
        className="text-left rounded-[10px] border border-border bg-card p-4 hover:border-border-strong hover:shadow-md transition-all relative overflow-hidden"
      >
        <div className="text-xs text-muted-foreground truncate font-medium pr-8">{bank.name}</div>
        <div className="text-xl font-semibold font-mono tracking-tight tabular-nums mt-2">{fmt(bank.balance)}</div>
        <span
          className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded border"
          style={
            bank.currency === "USD"
              ? { color: "var(--color-income)", borderColor: "var(--color-income)", background: "color-mix(in oklch, var(--color-income), transparent 85%)" }
              : { color: "var(--color-muted-foreground)", borderColor: "var(--color-border)" }
          }
        >
          {bank.currency}
        </span>
      </motion.button>

      <Dialog open={editOpen} onOpenChange={handleEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit bank</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Balance</Label>
              <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">Use this to manually correct or top up.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as BankCurrency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bank.balance !== 0 && <p className="text-xs text-muted-foreground">Changing currency on a non-zero balance is on you.</p>}
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="default"
              onClick={() => {
                setEditOpen(false);
                setDeleteOpen(true);
              }}
            >
              Delete
            </Button>
            <Button variant="default" size="default" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{bank.name}"?</AlertDialogTitle>
            <AlertDialogDescription>The bank is archived.</AlertDialogDescription>
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

// =====================================================================
// AddBankCard
// =====================================================================
function AddBankCard({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("0");
  const [currency, setCurrency] = useState<BankCurrency>("EGP");

  const handleOpen = (next: boolean) => {
    if (next) {
      setName("");
      setBalance("0");
      setCurrency("EGP");
    }
    setOpen(next);
  };

  const save = async () => {
    const b = parseFloat(balance);
    if (!name.trim() || isNaN(b)) return toast.error("Invalid input");
    try {
      await api.post("/payments/banks", { name: name.trim(), balance: b, currency });
      toast.success("Added");
      setOpen(false);
      onAdded();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <>
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.16 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => handleOpen(true)}
        className="rounded-[10px] border-2 border-dashed border-border p-4 hover:border-border-strong hover:bg-muted/50 transition-all flex items-center justify-center min-h-[80px] text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        <span className="text-sm font-medium">Add bank</span>
      </motion.button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add bank</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CIB, HSBC, Banque Misr..." />
            </div>
            <div className="space-y-1.5">
              <Label>Starting balance</Label>
              <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as BankCurrency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="default" size="default" onClick={save}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// ExternalSourceCard
// =====================================================================
function ExternalSourceCard({ source, onChanged, index }: { source: ExternalSource; onChanged: () => void; index: number }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(source.name);

  const handleEditOpen = (next: boolean) => {
    if (next) setName(source.name);
    setEditOpen(next);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    try {
      await api.patch(`/payments/external-sources/${source._id}`, { name: name.trim() });
      toast.success("Saved");
      setEditOpen(false);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async () => {
    try {
      await api.delete(`/payments/external-sources/${source._id}`);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => handleEditOpen(true)}
        className="text-left rounded-[10px] border border-border bg-card px-3 py-2.5 hover:border-border-strong hover:shadow-sm transition-all min-h-[52px] flex items-center"
      >
        <div className="text-sm font-medium truncate">{source.name}</div>
      </motion.button>

      <Dialog open={editOpen} onOpenChange={handleEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit person</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="default"
              onClick={() => {
                setEditOpen(false);
                setDeleteOpen(true);
              }}
            >
              Delete
            </Button>
            <Button variant="default" size="default" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{source.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This person will be archived.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={del}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =====================================================================
// AddExternalSourceCard
// =====================================================================
function AddExternalSourceCard({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleOpen = (next: boolean) => {
    if (next) setName("");
    setOpen(next);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    try {
      await api.post("/payments/external-sources", { name: name.trim() });
      toast.success("Added");
      setOpen(false);
      onAdded();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <>
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.16 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => handleOpen(true)}
        className="rounded-[10px] border-2 border-dashed border-border px-3 py-2.5 hover:border-border-strong hover:bg-muted/50 transition-all flex items-center justify-center min-h-[52px] text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        <span className="text-sm font-medium">Add person</span>
      </motion.button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dad, Mom, Sister..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="default" size="default" onClick={save}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// ExpenseRow
// =====================================================================
function ExpenseRow({ expense, wallets, banks, externalSources, onChanged }: { expense: Expense; wallets: Wallet[]; banks: Bank[]; externalSources: ExternalSource[]; onChanged: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState(expense.amount.toString());
  const [category, setCategory] = useState<Category>(expense.category);
  const [source, setSource] = useState<SourceSelection>({ sourceType: expense.sourceType, sourceId: expense.sourceId });
  const [date, setDate] = useState(expense.date.slice(0, 10));

  const handleEditOpen = (next: boolean) => {
    if (next) {
      setName(expense.name);
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setSource({ sourceType: expense.sourceType, sourceId: expense.sourceId });
      setDate(expense.date.slice(0, 10));
    }
    setEditOpen(next);
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!name.trim() || !amt || amt <= 0) return toast.error("Invalid input");
    try {
      await api.patch(`/payments/expenses/${expense._id}`, {
        name: name.trim(),
        amount: amt,
        category,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        date,
      });
      toast.success("Saved");
      setEditOpen(false);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async () => {
    try {
      await api.delete(`/payments/expenses/${expense._id}`);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const deleteDesc =
    expense.sourceType === "external"
      ? `${fmtEGP(expense.amount)} paid by ${expense.sourceNameSnapshot} — no balance change.`
      : `${fmtEGP(expense.amount)} will be returned to ${expense.sourceNameSnapshot}.`;

  return (
    <>
      <button type="button" onClick={() => handleEditOpen(true)} className="w-full flex items-center justify-between py-2 hover:bg-muted/40 rounded-md transition-colors text-left cursor-pointer">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <CategoryTag category={expense.category} />
          <span className="text-sm font-medium text-foreground truncate">{expense.name}</span>
          <span className="hidden md:inline-flex shrink-0">
            <SourcePill sourceType={expense.sourceType} name={expense.sourceNameSnapshot} />
          </span>
        </div>
        <span className="text-sm font-semibold font-mono tabular-nums shrink-0" style={{ color: "var(--color-expense)" }}>
          {fmtEGP(expense.amount)}
        </span>
      </button>

      <Dialog open={editOpen} onOpenChange={handleEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (L.E)</Label>
              <Input type="number" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory((v ?? "food") as Category)}>
                <SelectTrigger className="w-full capitalize !h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <SourcePicker
                wallets={wallets}
                banks={banks}
                externalSources={externalSources}
                value={source}
                onChange={setSource}
                triggerClassName="w-full h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="default"
              onClick={() => {
                setEditOpen(false);
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
            <Button variant="default" size="default" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>{deleteDesc}</AlertDialogDescription>
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
