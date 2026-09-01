import { AxiosError } from "axios";
import { api } from "./api";

export type SourceType = "wallet" | "bank" | "external";
export type Cycle = "weekly" | "monthly" | "yearly";

export const CYCLES: { key: Cycle; label: string; every: string }[] = [
  { key: "weekly", label: "Weekly", every: "a week" },
  { key: "monthly", label: "Monthly", every: "a month" },
  { key: "yearly", label: "Yearly", every: "a year" },
];

export const CATEGORIES = ["bills", "entertainment", "health", "education", "food", "transport", "shopping", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Subscription = {
  _id: string;
  name: string;
  price: number;
  cycle: Cycle;
  cycleLabel: string;
  billingDay: number;
  billingWeekday: number | null;
  billingMonth: number | null;
  sourceType: SourceType;
  sourceId: string;
  sourceNameSnapshot: string;
  category: Category;
  note: string;
  startDate: string;
  paidThrough: string | null;
  archived: boolean;

  nextDue: string;
  daysUntil: number;
  due: boolean;
  overdue: boolean;
  /** How many payments are owed, not just whether one is. */
  owedCount: number;
  owedTotal: number;
  monthlyEquivalent: number;
  yearlyEquivalent: number;
};

export type SubscriptionsSummary = {
  today: string;
  horizonDays: number;
  items: Subscription[];
  owing: Subscription[];
  upcoming: Subscription[];
  counts: { total: number; owing: number; upcoming: number };
  monthlyTotal: number;
  yearlyTotal: number;
  owedTotal: number;
  dueSoonTotal: number;
  byCategory: { category: string; monthly: number }[];
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function subsError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function loadSubscriptions(today: string): Promise<SubscriptionsSummary> {
  const r = await api.get<SubscriptionsSummary>("/payments/subscriptions", { params: { today } });
  return r.data;
}

export const chargeSubscription = (id: string, today: string) => api.post(`/payments/subscriptions/${id}/charge`, { today });
export const skipSubscription = (id: string, today: string) => api.post(`/payments/subscriptions/${id}/skip`, { today });
export const unsettleSubscription = (id: string, today: string) => api.post(`/payments/subscriptions/${id}/unsettle`, { today });

/** "the 1st", "every Tuesday", "31 December": when this actually goes out. */
export function scheduleLabel(sub: Pick<Subscription, "cycle" | "billingDay" | "billingWeekday" | "billingMonth">): string {
  if (sub.cycle === "weekly") return `Every ${WEEKDAYS[sub.billingWeekday ?? 1]}`;
  if (sub.cycle === "yearly") return `${sub.billingDay} ${MONTHS[(sub.billingMonth ?? 1) - 1]}`;
  return `The ${ordinal(sub.billingDay)}`;
}

export function ordinal(n: number): string {
  // 11th, 12th and 13th break the pattern the last digit would give them.
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "in 4 days", "today", "6 days late". */
export function dueLabel(sub: Subscription): string {
  if (sub.daysUntil === 0) return "due today";
  if (sub.daysUntil < 0) return `${Math.abs(sub.daysUntil)} day${sub.daysUntil === -1 ? "" : "s"} late`;
  if (sub.daysUntil === 1) return "due tomorrow";
  return `in ${sub.daysUntil} days`;
}
