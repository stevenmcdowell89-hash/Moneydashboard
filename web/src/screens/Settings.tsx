// SETTINGS — projection default, currency, tax year, and the editable tax_config
// (so a future tax year is a single edit).
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { api } from '../api/client';
import { gbp, type TaxConfig } from '../types';
import { Card, Section, Button, TextInput, Select, Stat } from '../components/ui';

export function Settings() {
  const { plan, update, taxConfig, setTaxConfig } = useStore();
  const [tc, setTc] = useState<TaxConfig | null>(taxConfig);
  const [tcStatus, setTcStatus] = useState<string>('');

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

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-3 px-1 text-2xl font-bold">Settings</h1>

      <Section title="Projection">
        <Card className="space-y-3 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Default horizon (months)</span>
            <Select
              className="w-32"
              value={plan.settings.projection_months_default}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, projection_months_default: Number(e.target.value) } }))}
            >
              {[12, 24, 36].map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Currency</span>
            <Select
              className="w-32"
              value={plan.settings.currency}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, currency: e.target.value } }))}
            >
              <option value="GBP">GBP (£)</option>
            </Select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Tax year</span>
            <TextInput
              className="w-32"
              value={plan.settings.tax_year}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, tax_year: e.target.value } }))}
            />
          </label>
        </Card>
      </Section>

      <Section title="Tax configuration (rUK)">
        {!tc ? (
          <Card className="p-4 text-sm text-slate-500">No tax config loaded.</Card>
        ) : (
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Tax year" value={tc.tax_year} />
              <Stat label="Personal allowance" value={gbp(tc.personal_allowance)} />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Personal allowance</span>
              <TextInput
                type="number"
                value={tc.personal_allowance}
                onChange={(e) => setTc({ ...tc, personal_allowance: Number(e.target.value) })}
              />
            </label>

            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Income-tax bands</div>
              {tc.bands.map((b, i) => (
                <div key={i} className="mb-2 grid grid-cols-2 gap-2">
                  <TextInput
                    type="number"
                    value={b.threshold}
                    onChange={(e) => {
                      const bands = [...tc.bands];
                      bands[i] = { ...b, threshold: Number(e.target.value) };
                      setTc({ ...tc, bands });
                    }}
                  />
                  <TextInput
                    type="number"
                    step="0.01"
                    value={b.rate}
                    onChange={(e) => {
                      const bands = [...tc.bands];
                      bands[i] = { ...b, rate: Number(e.target.value) };
                      setTc({ ...tc, bands });
                    }}
                  />
                </div>
              ))}
              <p className="text-xs text-slate-400">threshold = taxable income where the rate starts · rate as fraction (0.20)</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">NI primary threshold</span>
                <TextInput
                  type="number"
                  value={tc.ni_thresholds.primary}
                  onChange={(e) => setTc({ ...tc, ni_thresholds: { ...tc.ni_thresholds, primary: Number(e.target.value) } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">NI upper limit</span>
                <TextInput
                  type="number"
                  value={tc.ni_thresholds.upper}
                  onChange={(e) => setTc({ ...tc, ni_thresholds: { ...tc.ni_thresholds, upper: Number(e.target.value) } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">NI main rate</span>
                <TextInput
                  type="number"
                  step="0.01"
                  value={tc.ni_rates.main}
                  onChange={(e) => setTc({ ...tc, ni_rates: { ...tc.ni_rates, main: Number(e.target.value) } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">NI upper rate</span>
                <TextInput
                  type="number"
                  step="0.01"
                  value={tc.ni_rates.upper}
                  onChange={(e) => setTc({ ...tc, ni_rates: { ...tc.ni_rates, upper: Number(e.target.value) } })}
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={saveTax}>Save tax config</Button>
              <span className="text-xs text-slate-500">{tcStatus}</span>
            </div>
          </Card>
        )}
      </Section>

      <p className="px-1 text-center text-xs text-slate-400">Private single-user app · GBP · UK (NI / rUK bands)</p>
    </div>
  );
}
