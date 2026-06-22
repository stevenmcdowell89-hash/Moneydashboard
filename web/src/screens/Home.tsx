import { useState } from 'react';
import { useStore } from '../state/store';
import { useDashboard } from '../hooks/useDashboard';
import { formatYM } from '../lib/calendar';
import { gbp, todayYM } from '../types';
import { Modal, MoneyInput } from '../components/ui';
import { ForecastCard } from '../components/ForecastCard';
import { TargetsSection } from '../components/TargetsSection';
import { IncomeSection } from '../components/IncomeSection';
import { OutgoingsSection } from '../components/OutgoingsSection';
import { EventsSection } from '../components/EventsSection';
import { VariableTracker } from '../components/VariableTracker';
import { Reports } from '../components/Reports';
import { SettingsPanel } from './Settings';
import { PayBreakdownModal } from '../components/PayBreakdownModal';
import { KeypadProbe } from '../components/_KeypadProbe';

export function Home({ onOpenScenarios }: { onOpenScenarios: () => void }) {
  const { plan, update } = useStore();
  const [horizon, setHorizon] = useState(plan.settings.projection_months_default || 24);
  const [editCash, setEditCash] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [payId, setPayId] = useState<number | null>(null);

  const model = useDashboard(horizon);
  const m = model.monthOne;

  const showProbe = typeof window !== 'undefined' && window.location.hash === '#probe';

  return (
    <div className="mx-auto min-h-screen max-w-md px-3 pb-10 pt-4">
      {showProbe && <KeypadProbe />}
      <header className="mb-3 flex items-center justify-between px-1">
        <div>
          <h1 className="text-lg font-bold leading-none">Money Dashboard</h1>
          <p className="text-xs text-slate-400">{formatYM(todayYM())}</p>
        </div>
        <button onClick={() => setShowSettings(true)} className="rounded-full bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200" aria-label="Settings">⚙️</button>
      </header>

      {/* Hero */}
      <div className="mb-3 rounded-3xl bg-ink p-5 text-white shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Left to spend this month</p>
        <p className={`mt-1 text-4xl font-bold tabular-nums ${m.leftToSpend < 0 ? 'text-red-300' : ''}`}>{gbp(m.leftToSpend)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400">In</div><div className="font-semibold tabular-nums">{gbp(m.income)}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Bills</div><div className="font-semibold tabular-nums">{gbp(m.spend + m.events)}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Saved</div><div className="font-semibold tabular-nums text-green-300">{gbp(m.saved)}</div></div>
        </div>
        <div className="mt-4 border-t border-white/10 pt-3">
          {editCash ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Cash now</span>
              <div className="w-28"><MoneyInput value={plan.settings.opening_cash} onChange={(v) => update((d) => ({ ...d, settings: { ...d.settings, opening_cash: v } }))} /></div>
              <button onClick={() => setEditCash(false)} className="text-xs font-medium text-blue-300">done</button>
            </div>
          ) : (
            <button onClick={() => setEditCash(true)} className="text-sm text-slate-200">
              Cash now <span className="font-semibold text-white">{gbp(plan.settings.opening_cash)}</span> <span className="text-slate-400">✎</span>
            </button>
          )}
        </div>
      </div>

      {/* Rooms: one tap from home */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button onClick={onOpenScenarios} className="rounded-2xl bg-accent/10 px-4 py-3 text-sm font-semibold text-accent ring-1 ring-accent/20">
          🔀 Scenarios{plan.scenarios.length ? ` (${plan.scenarios.length})` : ''}
        </button>
        <button onClick={() => setShowReports(true)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
          📊 Reports
        </button>
      </div>

      <div className="space-y-3">
        <ForecastCard result={model.result} horizon={horizon} onHorizon={setHorizon} targets={model.targets} />
        <TargetsSection statuses={model.targets} />
        <IncomeSection onOpenPay={(id) => setPayId(id)} />
        <OutgoingsSection />
        <VariableTracker />
        <EventsSection />
      </div>

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings"><SettingsPanel /></Modal>
      <Modal open={showReports} onClose={() => setShowReports(false)} title="Reports"><Reports /></Modal>
      {payId != null && <PayBreakdownModal incomeId={payId} onClose={() => setPayId(null)} />}
    </div>
  );
}
