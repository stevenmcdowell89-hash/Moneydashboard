// §8 Pay calculator — per-income gross→net breakdown for UK 2026/27 rUK tax.
// Single-user budgeting app. Computes via the pure engine (netFromGross / netBonus).
// All amounts are annualised ESTIMATES, not exact cumulative PAYE.

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MoneyInput,
  Section,
  Select,
  Stat,
  TextInput,
} from '../components/ui';
import { netBonus, netFromGross } from '../engine';
import { nextTempId, useStore } from '../state/store';
import {
  gbp,
  gbp2,
  type Income,
  type IncomeOneoff,
  type PayBreakdown,
  type PensionType,
  type TaxConfig,
} from '../types';

const PENSION_TYPES: { value: PensionType; label: string }[] = [
  { value: 'salary_sacrifice', label: 'Salary sacrifice' },
  { value: 'net_pay', label: 'Net pay arrangement' },
  { value: 'relief_at_source', label: 'Relief at source' },
];

const ESTIMATE_NOTE = 'Estimate, not exact PAYE (which is cumulative across the year).';

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function NoteBanner() {
  return (
    <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-warn ring-1 ring-amber-200">
      Note: {ESTIMATE_NOTE}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' | 'muted' }) {
  const toneCls =
    tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : tone === 'muted' ? 'text-slate-400' : 'text-ink';
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}

const BAR_COLORS = ['#2563eb', '#dc2626', '#d97706', '#16a34a'];

/** Tiny gross → deductions → net bar visualisation. */
function BreakdownChart({ b }: { b: PayBreakdown }) {
  const data = [
    { name: 'Gross', value: Math.round(b.grossAnnual) },
    { name: 'Tax', value: Math.round(b.incomeTax) },
    { name: 'NI', value: Math.round(b.nationalInsurance) },
    { name: 'Net', value: Math.round(b.netAnnual) },
  ];
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v: number | string) => gbp(Number(v))}
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Full breakdown body shared by quick-calc and saved-income cards. */
function BreakdownBody({ b }: { b: PayBreakdown }) {
  return (
    <>
      <div className="mb-3">
        <Stat label="Net monthly" value={gbp2(b.netMonthly)} tone="good" sub={`${gbp(b.netAnnual)} / year`} />
      </div>
      <BreakdownChart b={b} />
      <div className="mt-2 divide-y divide-slate-100">
        <Row label="Gross annual" value={gbp(b.grossAnnual)} />
        <Row label="Pension / sacrifice" value={`− ${gbp(b.pensionAnnual)}`} tone="muted" />
        <Row label="Personal allowance" value={gbp(b.personalAllowance)} />
        <Row label="Taxable income" value={gbp(b.taxableIncome)} />
        <Row label="Income tax" value={`− ${gbp(b.incomeTax)}`} tone="bad" />
        <Row label="Employee NI" value={`− ${gbp(b.nationalInsurance)}`} tone="bad" />
        <Row label="Net annual" value={gbp(b.netAnnual)} tone="good" />
        {b.reliefAtSourceTopUp > 0 && (
          <Row label="Basic-rate top-up to pot" value={`+ ${gbp(b.reliefAtSourceTopUp)}`} tone="good" />
        )}
      </div>
    </>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Quick calc — experiment without saving
// ---------------------------------------------------------------------------

function QuickCalc({ taxConfig }: { taxConfig: TaxConfig }) {
  const [gross, setGross] = useState(50000);
  const [rate, setRate] = useState(5);
  const [type, setType] = useState<PensionType>('relief_at_source');
  const [sacrifice, setSacrifice] = useState(0);
  const [code, setCode] = useState('');

  const breakdown = useMemo(
    () => netFromGross(gross, rate, type, sacrifice, taxConfig, code || null),
    [gross, rate, type, sacrifice, taxConfig, code],
  );

  return (
    <Card className="p-4">
      <div className="mb-3 grid grid-cols-2 gap-3">
        <LabeledField label="Gross annual">
          <MoneyInput value={gross} onChange={setGross} step="100" />
        </LabeledField>
        <LabeledField label="Pension rate (%)">
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.5"
            value={rate}
            onChange={(e) => setRate(e.target.value === '' ? 0 : Number(e.target.value))}
          />
        </LabeledField>
        <LabeledField label="Pension type">
          <Select value={type} onChange={(e) => setType(e.target.value as PensionType)}>
            {PENSION_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </LabeledField>
        <LabeledField label="Salary sacrifice (£/mo)">
          <MoneyInput value={sacrifice} onChange={setSacrifice} step="10" />
        </LabeledField>
        <LabeledField label="Tax code (optional)">
          <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="1257L" />
        </LabeledField>
      </div>
      <BreakdownBody b={breakdown} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Saved gross income — editable, persisted via store.update
// ---------------------------------------------------------------------------

function IncomeCard({
  income,
  taxConfig,
  onChange,
}: {
  income: Income;
  taxConfig: TaxConfig;
  onChange: (patch: Partial<Income>) => void;
}) {
  const breakdown = useMemo(
    () =>
      netFromGross(
        income.gross_annual ?? 0,
        income.pension_rate ?? 0,
        income.pension_type ?? 'relief_at_source',
        income.sacrifice_monthly ?? 0,
        taxConfig,
        income.tax_code,
      ),
    [income.gross_annual, income.pension_rate, income.pension_type, income.sacrifice_monthly, income.tax_code, taxConfig],
  );

  const type = income.pension_type ?? 'relief_at_source';

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate font-semibold text-ink">{income.name || 'Untitled income'}</h3>
        <Badge tone={income.active ? 'good' : 'default'}>{income.active ? 'Active' : 'Inactive'}</Badge>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <LabeledField label="Gross annual">
          <MoneyInput value={income.gross_annual} onChange={(n) => onChange({ gross_annual: n })} step="100" />
        </LabeledField>
        <LabeledField label="Pension rate (%)">
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.5"
            value={income.pension_rate ?? 0}
            onChange={(e) => onChange({ pension_rate: e.target.value === '' ? 0 : Number(e.target.value) })}
          />
        </LabeledField>
        <LabeledField label="Pension type">
          <Select value={type} onChange={(e) => onChange({ pension_type: e.target.value as PensionType })}>
            {PENSION_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </LabeledField>
        <LabeledField label="Salary sacrifice (£/mo)">
          <MoneyInput
            value={income.sacrifice_monthly}
            onChange={(n) => onChange({ sacrifice_monthly: n })}
            step="10"
          />
        </LabeledField>
        <LabeledField label="Tax code (optional)">
          <TextInput
            value={income.tax_code ?? ''}
            onChange={(e) => onChange({ tax_code: e.target.value.trim() === '' ? null : e.target.value.toUpperCase() })}
            placeholder="1257L"
          />
        </LabeledField>
      </div>

      <BreakdownBody b={breakdown} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bonuses (income_oneoff)
// ---------------------------------------------------------------------------

function BonusRow({
  bonus,
  net,
  onChange,
  onRemove,
}: {
  bonus: IncomeOneoff;
  net: number;
  onChange: (patch: Partial<IncomeOneoff>) => void;
  onRemove: () => void;
}) {
  const sacrificePct = Math.max(0, bonus.pension_sacrifice_pct ?? 0);
  const afterSacrifice = bonus.gross_amount * (1 - sacrificePct / 100);

  return (
    <Card className="p-4">
      <div className="mb-3 grid grid-cols-2 gap-3">
        <LabeledField label="Name">
          <TextInput value={bonus.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Bonus" />
        </LabeledField>
        <LabeledField label="Month (1–N)">
          <TextInput
            type="number"
            inputMode="numeric"
            min={1}
            step="1"
            value={bonus.month}
            onChange={(e) => onChange({ month: e.target.value === '' ? 1 : Math.max(1, Number(e.target.value)) })}
          />
        </LabeledField>
        <LabeledField label="Gross amount">
          <MoneyInput value={bonus.gross_amount} onChange={(n) => onChange({ gross_amount: n })} step="100" />
        </LabeledField>
        <LabeledField label="Pension sacrifice (%)">
          <TextInput
            type="number"
            inputMode="decimal"
            step="1"
            value={bonus.pension_sacrifice_pct ?? 0}
            onChange={(e) =>
              onChange({ pension_sacrifice_pct: e.target.value === '' ? 0 : Number(e.target.value) })
            }
          />
        </LabeledField>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
        <Stat label="Gross" value={gbp(bonus.gross_amount)} />
        <Stat label="After sacrifice" value={gbp(afterSacrifice)} />
        <Stat label={`Net (month ${bonus.month})`} value={gbp(net)} tone="good" />
      </div>

      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PayCalculator() {
  const { plan, taxConfig, update } = useStore();

  const grossIncomes = useMemo(
    () => plan.income.filter((i) => i.entry_mode === 'gross'),
    [plan.income],
  );

  // Net of each bonus, keyed by id (depends on full active gross base + tax config).
  const bonusNets = useMemo(() => {
    const map = new Map<number, number>();
    if (!taxConfig) return map;
    for (const b of plan.income_oneoff) {
      map.set(b.id, netBonus(b, plan.income, taxConfig));
    }
    return map;
  }, [plan.income_oneoff, plan.income, taxConfig]);

  const patchIncome = (id: number, patch: Partial<Income>) =>
    update((draft) => ({
      ...draft,
      income: draft.income.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

  const patchBonus = (id: number, patch: Partial<IncomeOneoff>) =>
    update((draft) => ({
      ...draft,
      income_oneoff: draft.income_oneoff.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));

  const removeBonus = (id: number) =>
    update((draft) => ({
      ...draft,
      income_oneoff: draft.income_oneoff.filter((b) => b.id !== id),
    }));

  const addBonus = () =>
    update((draft) => ({
      ...draft,
      income_oneoff: [
        ...draft.income_oneoff,
        { id: nextTempId(), name: 'Bonus', gross_amount: 0, month: 1, pension_sacrifice_pct: 0 },
      ],
    }));

  if (!taxConfig) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <h1 className="mb-3 text-xl font-bold">Pay calculator</h1>
        <EmptyState
          title="No tax year configured"
          hint="Set the tax year in Settings to enable gross → net pay estimates."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-1 text-xl font-bold">Pay calculator</h1>
      <p className="mb-3 text-sm text-slate-500">
        UK {taxConfig.tax_year} {taxConfig.region} · gross → net estimates.
      </p>
      <NoteBanner />

      <Section title="Quick calc">
        <QuickCalc taxConfig={taxConfig} />
      </Section>

      <Section title="Saved gross incomes">
        {grossIncomes.length === 0 ? (
          <EmptyState
            title="No gross incomes yet"
            hint="Add a gross-entry income in the Plan editor to see its full pay breakdown here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {grossIncomes.map((income) => (
              <IncomeCard
                key={income.id}
                income={income}
                taxConfig={taxConfig}
                onChange={(patch) => patchIncome(income.id, patch)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Bonuses"
        action={
          <Button size="sm" variant="ghost" onClick={addBonus}>
            + Add bonus
          </Button>
        }
      >
        {plan.income_oneoff.length === 0 ? (
          <EmptyState
            title="No bonuses"
            hint="Add a one-off bonus to see its net, taxed marginally on top of your base gross income."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {plan.income_oneoff.map((bonus) => (
              <BonusRow
                key={bonus.id}
                bonus={bonus}
                net={bonusNets.get(bonus.id) ?? bonus.gross_amount}
                onChange={(patch) => patchBonus(bonus.id, patch)}
                onRemove={() => removeBonus(bonus.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <p className="mt-4 px-1 text-xs text-slate-400">{ESTIMATE_NOTE}</p>
    </div>
  );
}
