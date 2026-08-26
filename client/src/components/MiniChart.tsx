import { useState } from "react";

// =====================================================================
// Tiny dependency-free charts.
//
// The history modal only ever draws a handful of bars and a short line, which
// recharts was costing 320 kB to do. These render from plain CSS plus one inline
// SVG path: no measurement pass, no ResizeObserver, no re-render on mount, and
// they inherit the app's monochrome tokens directly.
// =====================================================================

export type BarPoint = {
  key: string;
  /** Axis label under the bar. */
  label: string;
  value: number;
  color: string;
  /** Lines shown in the hover card. */
  tooltip: string[];
};

export type LinePoint = {
  key: string;
  label: string;
  value: number;
  tooltip: string[];
};

/** Rounds an axis maximum up to something a human would pick. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const scaled = max / pow;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * pow;
}

function compact(n: number): string {
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

function HoverCard({ lines, side }: { lines: string[]; side: "left" | "right" }) {
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[11rem] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-left shadow-lg ${side === "left" ? "left-0" : "right-0"}`}
    >
      {lines.map((line, i) => (
        <div key={i} className={i === 0 ? "text-[11px] font-semibold" : "text-[11px] text-muted-foreground"}>
          {line}
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// Bars
// =====================================================================
export function BarSeries({ points, height = 208, emptyLabel = "No data in this period." }: { points: BarPoint[]; height?: number; emptyLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  // Past ~14 bars the labels collide, so thin them to roughly six evenly spaced.
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <div>
      <div className="flex gap-2" style={{ height }}>
        <div className="flex w-10 shrink-0 flex-col justify-between py-[1px] text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          {ticks.map((t) => (
            <span key={t}>{compact(max * t)}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${(1 - t) * 100}%` }} aria-hidden />
          ))}

          <div className="absolute inset-0 flex items-end gap-[3px]">
            {points.map((p, i) => (
              <div
                key={p.key}
                className="relative flex h-full min-w-0 flex-1 cursor-default items-end outline-none"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                tabIndex={0}
                aria-label={p.tooltip.join(", ")}
              >
                {/* Full-height catcher so the hover target is not just the bar tip. */}
                <div className={`absolute inset-0 rounded-sm ${hover === i ? "bg-muted/70" : "bg-transparent"}`} aria-hidden />
                <div
                  className="relative w-full rounded-t-[3px]"
                  style={{
                    height: `${Math.max(p.value > 0 ? 2 : 0, (p.value / max) * 100)}%`,
                    background: p.color,
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                  aria-hidden
                />
                {hover === i && <HoverCard lines={p.tooltip} side={i > points.length / 2 ? "right" : "left"} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex gap-[3px] pl-12">
        {points.map((p, i) => (
          <div key={p.key} className="min-w-0 flex-1 truncate text-center font-mono text-[10px] tabular-nums text-muted-foreground">
            {i % labelEvery === 0 ? p.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// Line
// =====================================================================
export function LineSeries({ points, height = 176, emptyLabel = "No data yet." }: { points: LinePoint[]; height?: number; emptyLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const max = niceMax(rawMax || 1);
  // A flat series would otherwise collapse onto a single line at the top.
  const min = rawMin === rawMax ? Math.max(0, rawMin - max * 0.25) : Math.max(0, rawMin - (rawMax - rawMin) * 0.35);
  const span = max - min || 1;

  // Reserve a margin top and bottom: a value sitting exactly on the axis max would
  // otherwise land at y=0 and have its dot clipped by the edge of the plot.
  const PAD = 5;
  const xAt = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  const yAt = (v: number) => PAD + (1 - (v - min) / span) * (100 - PAD * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.value)}`).join(" ");
  const area = `${path} L 100 100 L 0 100 Z`;
  const ticks = [1, 0.5, 0];
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <div>
      <div className="flex gap-2" style={{ height }}>
        <div className="relative w-10 shrink-0">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 font-mono text-[10px] tabular-nums text-muted-foreground" style={{ top: `${yAt(min + span * t)}%` }}>
              {compact(min + span * t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Gridlines run through the same padded transform so their labels stay honest. */}
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${yAt(min + span * t)}%` }} aria-hidden />
          ))}

          {/* preserveAspectRatio="none" lets the path stretch to any width; the
              non-scaling stroke keeps it an even 2px, and the dots below are HTML
              so nothing ends up visually distorted. */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d={area} fill="var(--color-muted)" opacity={0.6} />
            <path d={path} fill="none" stroke="var(--color-foreground)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>

          <div className="absolute inset-0">
            {points.map((p, i) => (
              <div
                key={p.key}
                className="absolute top-0 h-full -translate-x-1/2 outline-none"
                style={{ left: `${xAt(i)}%`, width: `${Math.max(100 / points.length, 8)}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                tabIndex={0}
                aria-label={p.tooltip.join(", ")}
              >
                <span
                  className="absolute left-1/2 h-2 w-2 rounded-full border-2 border-foreground bg-card"
                  style={{ top: `${yAt(p.value)}%`, transform: `translate(-50%,-50%) scale(${hover === i ? 1.5 : 1})` }}
                  aria-hidden
                />
                {hover === i && (
                  <div className="absolute w-full" style={{ top: `${yAt(p.value)}%` }}>
                    <HoverCard lines={p.tooltip} side={i > points.length / 2 ? "right" : "left"} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex pl-12">
        {points.map((p, i) => (
          <div key={p.key} className="min-w-0 flex-1 truncate text-center font-mono text-[10px] tabular-nums text-muted-foreground">
            {i % labelEvery === 0 || i === points.length - 1 ? p.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// Stacked bars
// =====================================================================
export type StackPoint = {
  key: string;
  label: string;
  /** Segment values, bottom to top. Must line up with `segments`. */
  values: number[];
  tooltip: string[];
  /** Renders hollow — used for days with nothing logged. */
  muted?: boolean;
};

export function StackedBarSeries({
  points,
  segments,
  height = 208,
  emptyLabel = "No data in this period.",
}: {
  points: StackPoint[];
  /** Bottom-to-top segment definitions. */
  segments: { label: string; color: string }[];
  height?: number;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  const totals = points.map((p) => p.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(...totals, 0));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <div>
      <div className="flex gap-2" style={{ height }}>
        <div className="flex w-10 shrink-0 flex-col justify-between py-[1px] text-right font-mono text-[10px] tabular-nums text-muted-foreground">
          {ticks.map((t) => (
            <span key={t}>{compact(max * t)}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${(1 - t) * 100}%` }} aria-hidden />
          ))}

          <div className="absolute inset-0 flex items-end gap-[3px]">
            {points.map((p, i) => {
              const total = totals[i];
              return (
                <div
                  key={p.key}
                  className="relative flex h-full min-w-0 flex-1 cursor-default flex-col justify-end outline-none"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                  tabIndex={0}
                  aria-label={p.tooltip.join(", ")}
                >
                  <div className={`absolute inset-0 rounded-sm ${hover === i ? "bg-muted/70" : "bg-transparent"}`} aria-hidden />
                  {total === 0 ? (
                    <div className="relative h-[3px] w-full rounded-full bg-border" aria-hidden />
                  ) : (
                    <div className="relative flex w-full flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: `${(total / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.45 }} aria-hidden>
                      {p.values.map((v, si) => (
                        <div key={si} style={{ height: `${total > 0 ? (v / total) * 100 : 0}%`, background: p.muted ? "var(--color-border)" : segments[si].color }} />
                      ))}
                    </div>
                  )}
                  {hover === i && <HoverCard lines={p.tooltip} side={i > points.length / 2 ? "right" : "left"} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex gap-[3px] pl-12">
        {points.map((p, i) => (
          <div key={p.key} className="min-w-0 flex-1 truncate text-center font-mono text-[10px] tabular-nums text-muted-foreground">
            {i % labelEvery === 0 ? p.label : ""}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-12">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
