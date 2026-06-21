import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { monthlyBillAmount } from '../engine';
import { api } from '../api/client';
import { currentYM, formatYM } from '../lib/calendar';
import { gbp, type Actual } from '../types';
import { MoneyInput } from './ui';

// Opt-in: only bills flagged `track_actuals` show here, so there's no monthly
// per-bill logging chore — just the couple of variable categories you chose.
export function VariableTracker() {
  const { plan } = useStore();
  const period = currentYM();
  const tracked = useMemo(() => plan.bills.filter((b) => b.track_actuals && b.active), [plan.bills]);
  const [actuals, setActuals] = useState<Record<number, number | null>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  useEffect(() => {
    if (tracked.length === 0) return;
    let cancelled = false;
    api.getActuals(period).then((rows) => {
      if (cancelled) return;
      const map: Record<number, number | null> = {};
      for (const r of rows) map[r.bill_id] = r.actual_amount;
      setActuals(map);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [period, tracked.length]);

  if (tracked.length === 0) return null;

  const setActual = (billId: number, v: number) => {
    const next = { ...actuals, [billId]: v };
    setActuals(next);
    // Debounce the network save so we don't PUT on every keystroke.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const rows: Omit<Actual, 'id'>[] = tracked.map((b) => ({
        period,
        bill_id: b.id,
        planned_amount: monthlyBillAmount(b),
        actual_amount: next[b.id] ?? null,
        note: null,
      }));
      api.putActuals(period, rows).catch(() => undefined);
    }, 600);
  };

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Variable spend — {formatYM(period)}</h2>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 divide-y divide-slate-100">
        {tracked.map((b) => {
          const planned = monthlyBillAmount(b);
          const actual = actuals[b.id];
          const variance = actual != null ? actual - planned : null;
          return (
            <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{b.name}</div>
                <div className="text-xs text-slate-400">budget {gbp(planned)}</div>
              </div>
              <div className="w-28">
                <MoneyInput value={actual ?? undefined} onChange={(v) => setActual(b.id, v)} placeholder="actual" />
              </div>
              <div className="w-14 text-right text-xs tabular-nums">
                {variance != null && (
                  <span className={variance > 0 ? 'text-bad' : 'text-good'}>{variance > 0 ? '+' : ''}{gbp(variance)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
