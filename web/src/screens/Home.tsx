import { useState } from 'react';
import { useStore } from '../state/store';
import { useDashboard, type Draft } from '../hooks/useDashboard';
import { formatYM } from '../lib/calendar';
import { gbp, todayYM } from '../types';
import { Modal, MoneyInput } from '../components/ui';
import { ForecastCard } from '../components/ForecastCard';
import { TargetsSection } from '../components/TargetsSection';
import { IncomeSection } from '../components/IncomeSection';
import { OutgoingsSection } from '../components/OutgoingsSection';
import { EventsSection } from '../components/EventsSection';
import { WhatIfPanel } from '../components/WhatIfPanel';
import { VariableTracker } from '../components/VariableTracker';
import { SettingsPanel } from './Settings';
import { PayBreakdownModal } from '../components/PayBreakdownModal';

export function Home() {
  const { plan, update } = useStore();
  const [horizon, setHorizon] = useState(plan.settings.projection_months_default || 24);
  const [whatIf, setWhatIf] = useState(false);
  const [draft, setDraft] = useState<Draft>(new Map());
  const [editCash, setEditCash] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [payId, setPayId] = useState<number | null>(null);

  const model = useDashboard(horizon, draft);
  const m = model.monthOne;

  const closeWhatIf = () => {
    setWhatIf(false);
    setDraft(new Map());
  };

  return (
    <div className="mx-auto min-h-screen max-w-md px-3 pb-10 pt-4">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between px-1">
        <div>
          <h1 className="text-lg font-bold leading-none">Money Dashboard</h1>
          <p className="text-xs text-slate-400">{formatYM(todayYM())}</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded-full bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200"
          aria-label="Settings"
        >
          ⚙️
        </button>
      </header>

      {/* Hero */}
      <div className="mb-3 rounded-3xl bg-ink p-5 text-white shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Left to spend this month</p>
        <p className={`mt-1 text-4xl font-bold tabular-nums ${m.leftToSpend < 0 ? 'text-red-300' : ''}`}>{gbp(m.leftToSpend)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">In</div>
            <div className="font-semibold tabular-nums">{gbp(m.income)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Bills</div>
            <div className="font-semibold tabular-nums">{gbp(m.spend + m.events)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Saved</div>
            <div className="font-semibold tabular-nums text-green-300">{gbp(m.saved)}</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          {editCash ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Cash now</span>
              <div className="w-28">
                <MoneyInput
                  value={plan.settings.opening_cash}
                  onChange={(v) => update((d) => ({ ...d, settings: { ...d.settings, opening_cash: v } }))}
                />
              </div>
              <button onClick={() => setEditCash(false)} className="text-xs font-medium text-blue-300">done</button>
            </div>
          ) : (
            <button onClick={() => setEditCash(true)} className="text-sm text-slate-200">
              Cash now <span className="font-semibold text-white">{gbp(plan.settings.opening_cash)}</span> <span className="text-slate-400">✎</span>
            </button>
          )}
          {model.hasDraft && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${model.endCashDelta >= 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
              {model.endCashDelta >= 0 ? '+' : ''}{gbp(model.endCashDelta)} end cash
            </span>
          )}
        </div>
        {whatIf && model.wasRed !== model.inRed && (
          <p className={`mt-2 text-center text-xs font-semibold ${model.inRed ? 'text-red-300' : 'text-green-300'}`}>
            {model.inRed ? 'This pushes you into the red' : '✓ Back in the black'}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <ForecastCard result={model.current} horizon={horizon} onHorizon={setHorizon} targets={model.targets.map((t) => t.current)} />

        {/* What-if */}
        {whatIf ? (
          <WhatIfPanel draft={draft} setDraft={setDraft} onClose={closeWhatIf} />
        ) : (
          <button
            onClick={() => setWhatIf(true)}
            className="w-full rounded-2xl bg-accent/10 px-4 py-3 text-sm font-semibold text-accent ring-1 ring-accent/20"
          >
            ✨ Try a what-if
          </button>
        )}

        <TargetsSection views={model.targets} />
        <IncomeSection onOpenPay={(id) => setPayId(id)} />
        <OutgoingsSection />
        <VariableTracker />
        <EventsSection />
      </div>

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings">
        <SettingsPanel />
      </Modal>

      {payId != null && <PayBreakdownModal incomeId={payId} onClose={() => setPayId(null)} />}
    </div>
  );
}
