import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, Plus, Search, BarChart3, Calendar, Wallet as WalletIcon, Check } from "lucide-react";
import { AxiosError } from "axios";
import { RecapModal } from "../components/RecapModal";

// ===== Types =====
type Wallet = { _id: string; name: string; balance: number };
type Category = "food" | "transport" | "bills" | "shopping" | "entertainment" | "health" | "education" | "other";
type Expense = {
  _id: string;
  name: string;
  amount: number;
  category: Category;
  walletId: string;
  walletNameSnapshot: string;
  date: string;
};

const CATEGORIES: Category[] = ["food", "transport", "bills", "shopping", "entertainment", "health", "education", "other"];

// ===== Helpers =====
const fmtEGP = (n: number) => `${Math.round(n).toLocaleString("en-US")} L.E`;
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

function WalletPicker({ wallets, value, onChange, placeholder = "Select wallet", includeAll = false, triggerClassName = "" }: { wallets: Wallet[]; value: string; onChange: (id: string) => void; placeholder?: string; includeAll?: boolean; triggerClassName?: string }) {
  const selected = wallets.find((w) => w._id === value);
  const display = includeAll && value === "all" ? "All" : (selected?.name ?? "");

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className={`w-full ${triggerClassName}`}>
        <SelectValue placeholder={placeholder}>{display || placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All</SelectItem>}
        {wallets.map((w) => (
          <SelectItem key={w._id} value={w._id}>
            {w.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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

// ===== Wallet pill =====
function WalletPill({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  return <span className={`font-medium rounded border border-foreground/40 text-foreground/80 ${size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"}`}>{name}</span>;
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function Payments() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterWallet, setFilterWallet] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [recapPeriod, setRecapPeriod] = useState<"week" | "month" | null>(null);

  const loadWallets = useCallback(async () => {
    try {
      const r = await api.get<Wallet[]>("/payments/wallets");
      setWallets(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterCategory !== "all") params.category = filterCategory;
      if (filterWallet !== "all") params.walletId = filterWallet;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const r = await api.get<Expense[]>("/payments/expenses", { params });
      setExpenses(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [search, filterCategory, filterWallet, filterFrom, filterTo]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const reloadAll = () => {
    void loadWallets();
    void loadExpenses();
  };

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  const grouped: Record<string, Expense[]> = {};
  for (const e of expenses) {
    const k = e.date.slice(0, 10);
    (grouped[k] ||= []).push(e);
  }
  const groupKeys = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  const hasActiveFilters = !!search || filterCategory !== "all" || filterWallet !== "all" || !!filterFrom || !!filterTo;
  const clearFilters = () => {
    setSearch("");
    setFilterCategory("all");
    setFilterWallet("all");
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

      {/* ===== Add expense ===== */}
      <AddExpenseForm wallets={wallets} onAdded={reloadAll} />

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
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Wallet</Label>
                <WalletPicker wallets={wallets} value={filterWallet} onChange={setFilterWallet} includeAll triggerClassName="!h-8" />
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
                      <ExpenseRow key={e._id} expense={e} wallets={wallets} onChanged={reloadAll} />
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
function AddExpenseForm({ wallets, onAdded }: { wallets: Wallet[]; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [walletId, setWalletId] = useState<string>("");
  const [date, setDate] = useState(todayISO());

  const save = async (originBtn: HTMLElement | null) => {
    const amt = parseFloat(amount);
    if (!name.trim()) return toast.error("Name required");
    if (!amt || amt <= 0) return toast.error("Amount > 0");
    if (!walletId) return toast.error("Pick a wallet");
    try {
      await api.post("/payments/expenses", {
        name: name.trim(),
        amount: amt,
        category,
        walletId,
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

          {/* Desktop: single grid row. Mobile: stacks. */}
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

            {/* Wallet */}
            <div>
              <Label className={labelCls}>Wallet</Label>
              <Select value={walletId} onValueChange={(v) => setWalletId(v ?? "")}>
                <SelectTrigger className={`w-full ${fieldHeight} !h-8`}>
                  <SelectValue placeholder="Select wallet">{wallets.find((w) => w._id === walletId)?.name ?? ""}</SelectValue>
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
// ExpenseRow
// =====================================================================
function ExpenseRow({ expense, wallets, onChanged }: { expense: Expense; wallets: Wallet[]; onChanged: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState(expense.amount.toString());
  const [category, setCategory] = useState<Category>(expense.category);
  const [walletId, setWalletId] = useState<string>(expense.walletId);
  const [date, setDate] = useState(expense.date.slice(0, 10));

  const handleEditOpen = (next: boolean) => {
    if (next) {
      setName(expense.name);
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setWalletId(expense.walletId);
      setDate(expense.date.slice(0, 10));
    }
    setEditOpen(next);
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!name.trim() || !amt || amt <= 0 || !walletId) return toast.error("Invalid input");
    try {
      await api.patch(`/payments/expenses/${expense._id}`, {
        name: name.trim(),
        amount: amt,
        category,
        walletId,
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

  return (
    <>
      <button type="button" onClick={() => handleEditOpen(true)} className="w-full flex items-center justify-between py-2 hover:bg-muted/40 rounded-md transition-colors text-left cursor-pointer">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <CategoryTag category={expense.category} />
          <span className="text-sm font-medium text-foreground truncate">{expense.name}</span>
          <span className="hidden md:inline-flex flex-shrink-0">
            <WalletPill name={expense.walletNameSnapshot} />
          </span>
        </div>
        <span className="text-sm font-semibold font-mono tabular-nums flex-shrink-0" style={{ color: "var(--color-expense)" }}>
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
              <Label>Wallet</Label>
              <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} />
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
            <AlertDialogDescription>
              {fmtEGP(expense.amount)} will be returned to {expense.walletNameSnapshot}.
            </AlertDialogDescription>
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
