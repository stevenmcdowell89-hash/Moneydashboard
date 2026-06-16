import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { api } from '../api/client';
import { type TaxConfig } from '../types';
import { Button, NumberInput, Select, TextInput } from '../components/ui';

export function SettingsPanel() {
  const { plan, update, taxConfig, setTaxConfig } = useStore();
  const [tc, setTc] = useState<TaxConfig | null>(taxConfig);
  const [tcStatus, setTcStatus] = useState('');
  const [showTax, setShowTax] = useState(false);
  useEffect(() => setTc(taxConfig), [taxConfig]);

  const saveTax = async () => {
    if (!tc) return;
    setTcStatus('saving…');
    try {
      const saved = await api.putTaxConfig(tc);
      setTaxConfig(saved);
      setTcStatus('saved');
      setTimeout(() => setTcStatus(''), 1500);
    } catch (e) {
      setTcStatus(e instanceof Error ? e.message : 'error');
    }
  };

  const lbl = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={lbl}>Default savings interest</span>
          <NumberInput
            value={plan.settings.default_savings_rate}
            onChange={(n) => update((d) => ({ ...d, settings: { ...d.settings, default_savings_rate: n } }))}
            suffix="%"
          />
        </label>
        <label className="block">
          <span className={lbl}>Forecast horizon</span>
          <Select
            value={plan.settings.projection_months_default}
            onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, projection_months_default: Number(e.target.value) } }))}
          >
            {[12, 24, 36].map((h) => (
              <option key={h} value={h}>{h} months</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className={lbl}>Currency</span>
          <Select value={plan.settings.currency} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, currency: e.target.value } }))}>
            <option value="GBP">GBP (£)</option>
          </Select>
        </label>
        <label className="block">
          <span className={lbl}>Tax year</span>
          <TextInput value={plan.settings.tax_year} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, tax_year: e.target.value } }))} />
        </label>
      </div>

      <div>
        <button onClick={() => setShowTax((s) => !s)} className="text-sm font-medium text-accent">
          {showTax ? 'Hide' : 'Edit'} tax configuration (rUK)
        </button>
        {showTax && tc && (
          <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 p-3">
            <label className="block">
              <span className={lbl}>Personal allowance</span>
              <NumberInput value={tc.personal_allowance} onChange={(n) => setTc({ ...tc, personal_allowance: n })} />
            </label>
            <div>
              <span className={lbl}>Income-tax bands (threshold · rate)</span>
              {tc.bands.map((b, i) => (
                <div key={i} className="mb-2 grid grid-cols-2 gap-2">
                  <NumberInput value={b.threshold} onChange={(n) => { const bands = [...tc.bands]; bands[i] = { ...b, threshold: n }; setTc({ ...tc, bands }); }} />
                  <NumberInput value={b.rate} step="0.01" onChange={(n) => { const bands = [...tc.bands]; bands[i] = { ...b, rate: n }; setTc({ ...tc, bands }); }} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={lbl}>NI primary</span><NumberInput value={tc.ni_thresholds.primary} onChange={(n) => setTc({ ...tc, ni_thresholds: { ...tc.ni_thresholds, primary: n } })} /></label>
              <label className="block"><span className={lbl}>NI upper</span><NumberInput value={tc.ni_thresholds.upper} onChange={(n) => setTc({ ...tc, ni_thresholds: { ...tc.ni_thresholds, upper: n } })} /></label>
              <label className="block"><span className={lbl}>NI main rate</span><NumberInput value={tc.ni_rates.main} step="0.01" onChange={(n) => setTc({ ...tc, ni_rates: { ...tc.ni_rates, main: n } })} /></label>
              <label className="block"><span className={lbl}>NI upper rate</span><NumberInput value={tc.ni_rates.upper} step="0.01" onChange={(n) => setTc({ ...tc, ni_rates: { ...tc.ni_rates, upper: n } })} /></label>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={saveTax}>Save tax config</Button>
              <span className="text-xs text-slate-500">{tcStatus}</span>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400">Money Dashboard · private · GBP · UK (NI / rUK)</p>
    </div>
  );
}
