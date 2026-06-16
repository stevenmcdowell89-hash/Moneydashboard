// Shared Recharts helpers used ONLY by the Dashboard screen.
// Keeps the Dashboard component lean: palette, currency tooltip, axis
// formatters and a couple of thin chart-frame wrappers live here.

import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { gbp } from '../types';

// ---------------------------------------------------------------------------
// Palette — accent + status tokens plus a small categorical ramp for charts
// with an arbitrary number of series (scenarios / targets / categories).
// ---------------------------------------------------------------------------

export const TOKENS = {
  accent: '#2563eb',
  good: '#16a34a',
  warn: '#d97706',
  bad: '#dc2626',
} as const;

/** Categorical palette — deterministic per-index colour for N series. */
export const PALETTE = [
  '#2563eb', // blue (accent)
  '#16a34a', // green
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#ea580c', // orange
  '#475569', // slate
] as const;

export const colorAt = (i: number): string => PALETTE[i % PALETTE.length];

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Compact axis tick: £1.2k / £3.4m, falls back to plain gbp for small values. */
export function axisMoney(n: number): string {
  if (!Number.isFinite(n)) return '£0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `£${(n / 1_000).toFixed(1)}k`;
  return gbp(n);
}

export const monthLabel = (m: number | string): string => `M${m}`;

// ---------------------------------------------------------------------------
// Currency tooltip — typed locally so we avoid Recharts' loose internal types.
// ---------------------------------------------------------------------------

interface TooltipEntry {
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
}

interface MoneyTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** How to render the row label header (defaults to "Month N"). */
  labelFormatter?: (label: string | number) => string;
}

function toNumber(v: TooltipEntry['value']): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  return 0;
}

export function MoneyTooltip({ active, label, payload, labelFormatter }: MoneyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const header =
    labelFormatter && label !== undefined
      ? labelFormatter(label)
      : label !== undefined
        ? `Month ${label}`
        : '';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      {header && <div className="mb-1 font-semibold text-slate-700">{header}</div>}
      <div className="flex flex-col gap-0.5">
        {payload.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: e.color }} />
              {e.name}
            </span>
            <span className="font-medium tabular-nums text-slate-800">{gbp(toNumber(e.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart frame — a titled card-body wrapper around a ResponsiveContainer.
// The Dashboard wraps each of these in a <Card>; this gives the inner
// padding + heading + responsive sizing in one place.
// ---------------------------------------------------------------------------

export function ChartFrame({
  title,
  subtitle,
  action,
  height = 240,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  height?: number;
  /** A single Recharts chart element (ResponsiveContainer wraps it). */
  children: ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* Recharts requires a single child element here. */}
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goal progress bar — current / target with status colouring.
// ---------------------------------------------------------------------------

export function ProgressBar({
  label,
  current,
  target,
}: {
  label: string;
  current: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  const done = pct >= 1;
  const colour = done ? TOKENS.good : pct >= 0.66 ? TOKENS.accent : TOKENS.warn;
  return (
    <div className="py-1">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="tabular-nums text-slate-500">
          {gbp(current)} / {gbp(target)} ({Math.round(pct * 100)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct * 100}%`, background: colour }}
        />
      </div>
    </div>
  );
}
