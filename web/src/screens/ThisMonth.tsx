// THIS MONTH — the simple front door. Headline money for the current month,
// each savings target's progress, and quick per-bill actuals entry.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useThisMonth } from '../hooks/useProjection';
import { requiredContribution, monthGoalHit, normalizeFrequency } from '../engine';
import { api } from '../api/client';
import { gbp, gbp2, type Actual, type SavingsTarget } from '../types';
import { Card, Section, Stat, Badge, MoneyInput, EmptyState } from '../components/ui';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function TargetRow({ target, horizon }: { target: SavingsTarget; horizon: number }) {
  const goal = target.target_amount;
  const monthsRemaining = target.target_month ? Math.max(1, target.target_month) : null;
  const required = goal != null && monthsRemaining ? requiredContribution(target, monthsRemaining) : null;
  const hitsAt = goal != null ? monthGoalHit(target, Math.max(horizon, monthsRemaining ?? horizon)) : null;
  const onTrack =
    goal != null && monthsRemaining != null ? hitsAt != null && hitsAt <= monthsRemaining : required == null ? null : (target.monthly_contribution >= (required ?? 0));
  const pct = goal && goal > 0 ? Math.min(100, (target.balance / goal) * 100) : null;

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex items-center justify-between">
        <div className="font-medium">{target.name}</div>
        <div className="text-right tabular-nums">
          {gbp(target.balance)}
          {goal != null && <span className="text-slate-400"> / {gbp(goal)}</span>}
        </div>
      </div>
      {pct != null && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>
          {gbp(target.monthly_contribution)}/mo
          {required != null && <> · needs {gbp(required)}/mo</>}
        </span>
        {onTrack != null && (
          <Badge tone={onTrack ? 'good' : 'warn'}>
            {onTrack ? (hitsAt ? `on track (m${hitsAt})` : 'on track') : 'behind'}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function ThisMonth() {
  const { plan } = useStore();
  const m = useThisMonth();
  const horizon = plan.settings.projection_months_default;
  const period = currentPeriod();

  const activeBills = useMemo(() => plan.bills.filter((b) => b.active), [plan.bills]);
  const [actuals, setActuals] = useState<Record<number, number | null>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getActuals(period)
      .then((rows) => {
        if (cancelled) return;
        const map: Record<number, number | null> = {};
        for (const r of rows) map[r.bill_id] = r.actual_amount;
        setActuals(map);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const saveActuals = (next: Record<number, number | null>) => {
    const rows: Omit<Actual, 'id'>[] = activeBills.map((b) => ({
      period,
      bill_id: b.id,
      planned_amount: normalizeFrequency(b.amount, b.frequency),
      actual_amount: next[b.id] ?? null,
      note: null,
    }));
    api.putActuals(period, rows).catch(() => undefined);
  };

  const setActual = (billId: number, v: number) => {
    const next = { ...actuals, [billId]: v };
    setActuals(next);
    saveActuals(next);
  };

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-3 px-1 text-2xl font-bold">This Month</h1>

      <Card className="mb-4 grid grid-cols-2 gap-y-4 p-4">
        <Stat label="Free cash" value={gbp(m.freeCash)} sub="income − bills − events" tone={m.freeCash >= 0 ? 'good' : 'bad'} />
        <Stat label="Safe to spend" value={gbp(m.safeToSpend)} sub="after savings" tone={m.safeToSpend >= 0 ? 'default' : 'bad'} />
        <Stat label="Current cash" value={gbp(m.currentCash)} />
        <Stat label="Monthly income" value={gbp(m.income)} sub="net" />
        <Stat label="Bills" value={gbp(m.bills)} tone="warn" />
        <Stat label="Into savings" value={gbp(m.contributions)} />
      </Card>

      <Section title="Savings targets">
        <Card>
          {plan.savings_targets.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No savings targets yet" hint="Add one in the Plan editor to track progress." />
            </div>
          ) : (
            plan.savings_targets.map((t) => <TargetRow key={t.id} target={t} horizon={horizon} />)
          )}
        </Card>
      </Section>

      <Section title="Quick actuals — this month">
        <Card>
          {activeBills.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No bills to log" hint="Add bills in the Plan editor." />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeBills.map((b) => {
                const planned = normalizeFrequency(b.amount, b.frequency);
                const actual = actuals[b.id];
                const variance = actual != null ? actual - planned : null;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{b.name}</div>
                      <div className="text-xs text-slate-400">planned {gbp2(planned)}</div>
                    </div>
                    <div className="w-28">
                      <MoneyInput value={actual ?? undefined} onChange={(v) => setActual(b.id, v)} placeholder={loaded ? 'actual' : '…'} />
                    </div>
                    <div className="w-16 text-right text-xs tabular-nums">
                      {variance != null && (
                        <span className={variance > 0 ? 'text-bad' : 'text-good'}>
                          {variance > 0 ? '+' : ''}
                          {gbp(variance)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
