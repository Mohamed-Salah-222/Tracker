import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Card, CardContent } from "../ui/card";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

/** One block of settings. Every section on the page is built from this. */
export function Section({ title, blurb, children, action }: { title: string; blurb?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <motion.section {...fadeUp} aria-label={title}>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-[min(100%,16rem)] flex-1">
              <h2 className="text-sm font-semibold">{title}</h2>
              {blurb && <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-muted-foreground">{blurb}</p>}
            </div>
            {action}
          </div>
          <div className="mt-3">{children}</div>
        </CardContent>
      </Card>
    </motion.section>
  );
}

/**
 * A labelled row with its control beside it.
 *
 * The label is given a floor of 14rem rather than being free to shrink. Without one
 * it kept giving ground to the control, so on a phone the words were squeezed into a
 * column three or four characters wide while a switch sat comfortably beside them.
 *
 * With a floor, the two behave differently and correctly: a switch is small enough to
 * stay on the right at any width, and a wide row of choices wraps onto its own line
 * underneath instead of crushing the text.
 */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border py-2.5 last:border-b-0">
      <div className="min-w-[min(100%,14rem)] flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * A switch, drawn the way the rest of the app draws state: filled when on, outlined
 * when off. No colour, no green.
 */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${on ? "border-foreground bg-foreground" : "border-border-strong bg-muted"}`}
    >
      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${on ? "left-[1.125rem] bg-background" : "left-0.5 bg-background border border-border-strong"}`} />
    </button>
  );
}

/** A row of mutually exclusive choices. */
export function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div className="flex w-full flex-wrap gap-1 rounded-lg border border-border-strong p-1 sm:w-auto" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          onClick={() => onChange(option.key)}
          className={`h-8 flex-1 rounded-md px-2.5 text-[11px] font-semibold whitespace-nowrap transition-colors sm:flex-none ${
            value === option.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
