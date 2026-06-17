import { useState } from 'react';
import { useStore, nextTempId } from '../state/store';
import { PlanScopeProvider, type PlanScope } from '../state/scope';
import { evaluatePlan } from '../hooks/useDashboard';
import { parsePayload, scenarioPlanFrom } from '../lib/scenario';
import { gbp, type Scenario } from '../types';
import { ForecastCard } from '../components/ForecastCard';
import { TargetsSection } from '../components/TargetsSection';
import { IncomeSection } from '../components/IncomeSection';
import { OutgoingsSection } from '../components/OutgoingsSection';
import { EventsSection } from '../components/EventsSection';
import { PayBreakdownModal } from '../components/PayBreakdownModal';
import { Compare } from '../components/Compare';
import { Button, TextInput } from '../components/ui';

function ScenarioEditor({ scenario, onBack }: { scenario: Scenario; onBack: () => void }) {
  const { taxConfig, update: storeUpdate } = useStore();
  const scenarioPlan = parsePayload(scenario.payload);
  const [horizon, setHorizon] = useState(scenarioPlan.settings.projection_months_default || 24);
  const [payId, setPayId] = useState<number | null>(null);

  const scope: PlanScope = {
    plan: scenarioPlan,
    taxConfig,
    update: (fn) =>
      storeUpdate((d) => ({
        ...d,
        scenarios: d.scenarios.map((s) =>
          s.id === scenario.id ? { ...s, payload: JSON.stringify(fn(parsePayload(s.payload))) } : s,
        ),
      })),
  };

  const evaln = evaluatePlan(scenarioPlan, taxConfig, horizon);

  const rename = (name: string) =>
    storeUpdate((d) => ({ ...d, scenarios: d.scenarios.map((s) => (s.id === scenario.id ? { ...s, name } : s)) }));
  const remove = () => {
    storeUpdate((d) => ({ ...d, scenarios: d.scenarios.filter((s) => s.id !== scenario.id) }));
    onBack();
  };
  const promote = () => {
    if (!window.confirm('Replace your base plan with this scenario? Your current plan will be overwritten.')) return;
    storeUpdate((d) => ({ ...d, ...scenarioPlan }));
    onBack();
  };

  return (
    <PlanScopeProvider value={scope}>
      <div className="mx-auto min-h-screen max-w-md px-3 pb-10 pt-4">
        <header className="mb-3 flex items-center gap-2">
          <button onClick={onBack} className="rounded-full bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200">←</button>
          <TextInput value={scenario.name} onChange={(e) => rename(e.target.value)} className="flex-1 font-semibold" placeholder="Scenario name" />
        </header>

        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-warn ring-1 ring-amber-200">
          Editing this scenario — your base plan is untouched.
        </p>

        <div className="space-y-3">
          <ForecastCard result={evaln.result} horizon={horizon} onHorizon={setHorizon} targets={evaln.targets} />
          <TargetsSection statuses={evaln.targets} />
          <IncomeSection onOpenPay={(id) => setPayId(id)} />
          <OutgoingsSection />
          <EventsSection />

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" variant="subtle" onClick={promote}>Promote to base plan</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </div>
        </div>

        {payId != null && <PayBreakdownModal incomeId={payId} onClose={() => setPayId(null)} />}
      </div>
    </PlanScopeProvider>
  );
}

export function ScenariosWorkspace({ onClose }: { onClose: () => void }) {
  const { plan, update, taxConfig } = useStore();
  const [tab, setTab] = useState<'list' | 'compare'>('list');
  const [openId, setOpenId] = useState<number | null>(null);

  const open = plan.scenarios.find((s) => s.id === openId) ?? null;
  if (open) return <ScenarioEditor scenario={open} onBack={() => setOpenId(null)} />;

  const create = () => {
    const id = nextTempId();
    update((d) => ({
      ...d,
      scenarios: [
        ...d.scenarios,
        { id, name: `Scenario ${d.scenarios.length + 1}`, payload: JSON.stringify(scenarioPlanFrom(d)), created_at: new Date().toISOString() },
      ],
    }));
    setOpenId(id);
  };

  return (
    <div className="mx-auto min-h-screen max-w-md px-3 pb-10 pt-4">
      <header className="mb-3 flex items-center gap-2">
        <button onClick={onClose} className="rounded-full bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200">←</button>
        <h1 className="text-lg font-bold">Scenarios</h1>
        <div className="ml-auto flex gap-1 rounded-full bg-slate-100 p-0.5">
          {(['list', 'compare'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${tab === t ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}
            >
              {t === 'list' ? 'Scenarios' : 'Compare'}
            </button>
          ))}
        </div>
      </header>

      {tab === 'compare' ? (
        <Compare />
      ) : (
        <div className="space-y-2">
          <Button className="w-full" onClick={create}>+ New scenario (copy of your plan)</Button>
          {plan.scenarios.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-8 text-center text-sm text-slate-400">
              A scenario is a full copy of your plan you can change freely — add a new salary, bills or one-offs — without touching the real thing.
            </div>
          ) : (
            plan.scenarios.map((s) => {
              const ev = evaluatePlan(parsePayload(s.payload), taxConfig, plan.settings.projection_months_default || 24);
              const end = ev.result.points[ev.result.points.length - 1];
              return (
                <button
                  key={s.id}
                  onClick={() => setOpenId(s.id)}
                  className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200"
                >
                  <div>
                    <div className="font-semibold">{s.name || 'Scenario'}</div>
                    <div className="text-xs text-slate-400">
                      {ev.targets.length} target{ev.targets.length === 1 ? '' : 's'} · end cash {gbp(end?.cash ?? 0)}
                    </div>
                  </div>
                  <span className="text-slate-300">›</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
