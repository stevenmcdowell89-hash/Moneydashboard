// PLAN EDITOR — CRUD for income (net/gross), bills, savings targets, events,
// and opening cash. Every change flows through store.update (debounced save).
import { useState } from 'react';
import { useStore, nextTempId } from '../state/store';
import {
  FREQUENCIES,
  gbp,
  type Bill,
  type Income,
  type PlanEvent,
  type SavingsTarget,
  type Frequency,
  type PensionType,
  type EntryMode,
} from '../types';
import { Card, Section, Button, TextInput, MoneyInput, Select, Toggle, Modal, EmptyState } from '../components/ui';

function Row({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">{children}</div>
      <Button variant="danger" size="sm" onClick={onDelete}>
        ✕
      </Button>
    </div>
  );
}

function FrequencySelect({ value, onChange }: { value: Frequency; onChange: (f: Frequency) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Frequency)}>
      {FREQUENCIES.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </Select>
  );
}

export function PlanEditor() {
  const { plan, update } = useStore();
  const [editIncome, setEditIncome] = useState<Income | null>(null);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [editTarget, setEditTarget] = useState<SavingsTarget | null>(null);
  const [editEvent, setEditEvent] = useState<PlanEvent | null>(null);

  // ---- mutators ----
  const upsertIncome = (i: Income) =>
    update((d) => ({ ...d, income: d.income.some((x) => x.id === i.id) ? d.income.map((x) => (x.id === i.id ? i : x)) : [...d.income, i] }));
  const upsertBill = (b: Bill) =>
    update((d) => ({ ...d, bills: d.bills.some((x) => x.id === b.id) ? d.bills.map((x) => (x.id === b.id ? b : x)) : [...d.bills, b] }));
  const upsertTarget = (t: SavingsTarget) =>
    update((d) => ({
      ...d,
      savings_targets: d.savings_targets.some((x) => x.id === t.id)
        ? d.savings_targets.map((x) => (x.id === t.id ? t : x))
        : [...d.savings_targets, t],
    }));
  const upsertEvent = (e: PlanEvent) =>
    update((d) => ({ ...d, events: d.events.some((x) => x.id === e.id) ? d.events.map((x) => (x.id === e.id ? e : x)) : [...d.events, e] }));

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-3 px-1 text-2xl font-bold">Plan editor</h1>

      {/* Opening cash */}
      <Section title="Opening cash">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex-1 text-sm text-slate-500">Your cash balance right now</div>
          <div className="w-36">
            <MoneyInput
              value={plan.settings.opening_cash}
              onChange={(v) => update((d) => ({ ...d, settings: { ...d.settings, opening_cash: v } }))}
            />
          </div>
        </Card>
      </Section>

      {/* Income */}
      <Section
        title="Income"
        action={
          <Button size="sm" onClick={() => setEditIncome(blankIncome())}>
            + Add
          </Button>
        }
      >
        <Card>
          {plan.income.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No income yet" hint="Add a net amount or a gross salary." />
            </div>
          ) : (
            plan.income.map((i) => (
              <Row key={i.id} onDelete={() => update((d) => ({ ...d, income: d.income.filter((x) => x.id !== i.id) }))}>
                <button className="w-full text-left" onClick={() => setEditIncome(i)}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{i.name || 'Income'}</span>
                    <span className="tabular-nums">
                      {i.entry_mode === 'gross' ? `${gbp(i.gross_annual ?? 0)}/yr gross` : `${gbp(i.net_amount ?? 0)} ${i.frequency} net`}
                    </span>
                  </div>
                  {!i.active && <span className="text-xs text-slate-400">inactive</span>}
                </button>
              </Row>
            ))
          )}
        </Card>
      </Section>

      {/* Bills */}
      <Section
        title="Bills"
        action={
          <Button size="sm" onClick={() => setEditBill(blankBill())}>
            + Add
          </Button>
        }
      >
        <Card>
          {plan.bills.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No bills yet" hint="Add your recurring outgoings." />
            </div>
          ) : (
            plan.bills.map((b) => (
              <Row key={b.id} onDelete={() => update((d) => ({ ...d, bills: d.bills.filter((x) => x.id !== b.id) }))}>
                <button className="w-full text-left" onClick={() => setEditBill(b)}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.name || 'Bill'}</span>
                    <span className="tabular-nums">{gbp(b.amount)} {b.frequency}</span>
                  </div>
                  <div className="text-xs text-slate-400">{b.category || 'Uncategorised'}{!b.active && ' · inactive'}</div>
                </button>
              </Row>
            ))
          )}
        </Card>
      </Section>

      {/* Savings targets */}
      <Section
        title="Savings targets"
        action={
          <Button size="sm" onClick={() => setEditTarget(blankTarget())}>
            + Add
          </Button>
        }
      >
        <Card>
          {plan.savings_targets.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No savings targets" hint="Track pots and goals." />
            </div>
          ) : (
            plan.savings_targets.map((t) => (
              <Row key={t.id} onDelete={() => update((d) => ({ ...d, savings_targets: d.savings_targets.filter((x) => x.id !== t.id) }))}>
                <button className="w-full text-left" onClick={() => setEditTarget(t)}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.name || 'Pot'}</span>
                    <span className="tabular-nums">{gbp(t.balance)}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {gbp(t.monthly_contribution)}/mo · {t.annual_rate}%
                    {t.target_amount != null && ` · goal ${gbp(t.target_amount)}${t.target_month ? ` by m${t.target_month}` : ''}`}
                  </div>
                </button>
              </Row>
            ))
          )}
        </Card>
      </Section>

      {/* Events */}
      <Section
        title="One-off events"
        action={
          <Button size="sm" onClick={() => setEditEvent(blankEvent())}>
            + Add
          </Button>
        }
      >
        <Card>
          {plan.events.filter((e) => e.applies_to === 'all').length === 0 ? (
            <div className="p-4">
              <EmptyState title="No events" hint="One-off costs spread over a period (e.g. a holiday)." />
            </div>
          ) : (
            plan.events
              .filter((e) => e.applies_to === 'all')
              .map((e) => (
                <Row key={e.id} onDelete={() => update((d) => ({ ...d, events: d.events.filter((x) => x.id !== e.id) }))}>
                  <button className="w-full text-left" onClick={() => setEditEvent(e)}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{e.name || 'Event'}</span>
                      <span className="tabular-nums">{gbp(e.total_cost)}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      months {e.start_month}–{e.start_month + e.duration_months - 1}
                    </div>
                  </button>
                </Row>
              ))
          )}
        </Card>
      </Section>

      {/* ---- Editors ---- */}
      {editIncome && (
        <IncomeEditor
          value={editIncome}
          onClose={() => setEditIncome(null)}
          onSave={(i) => {
            upsertIncome(i);
            setEditIncome(null);
          }}
        />
      )}
      {editBill && (
        <BillEditor
          value={editBill}
          onClose={() => setEditBill(null)}
          onSave={(b) => {
            upsertBill(b);
            setEditBill(null);
          }}
        />
      )}
      {editTarget && (
        <TargetEditor
          value={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(t) => {
            upsertTarget(t);
            setEditTarget(null);
          }}
        />
      )}
      {editEvent && (
        <EventEditor
          value={editEvent}
          onClose={() => setEditEvent(null)}
          onSave={(e) => {
            upsertEvent(e);
            setEditEvent(null);
          }}
        />
      )}
    </div>
  );
}

// ---- blank factories ----
const blankIncome = (): Income => ({
  id: nextTempId(),
  name: '',
  entry_mode: 'net',
  frequency: 'Monthly',
  active: true,
  net_amount: 0,
  gross_annual: null,
  pension_rate: null,
  pension_type: null,
  sacrifice_monthly: null,
});
const blankBill = (): Bill => ({ id: nextTempId(), name: '', category: '', amount: 0, frequency: 'Monthly', active: true });
const blankTarget = (): SavingsTarget => ({
  id: nextTempId(),
  name: '',
  balance: 0,
  monthly_contribution: 0,
  annual_rate: 0,
  target_amount: null,
  target_month: null,
  ring_fenced: true,
});
const blankEvent = (): PlanEvent => ({ id: nextTempId(), name: '', total_cost: 0, start_month: 1, duration_months: 1, applies_to: 'all' });

// ---- field helpers ----
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function IncomeEditor({ value, onSave, onClose }: { value: Income; onSave: (i: Income) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  const set = (patch: Partial<Income>) => setV((p) => ({ ...p, ...patch }));
  return (
    <Modal open onClose={onClose} title="Income">
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Salary" />
        </Field>
        <Field label="Entry mode">
          <Select value={v.entry_mode} onChange={(e) => set({ entry_mode: e.target.value as EntryMode })}>
            <option value="net">Net (take-home)</option>
            <option value="gross">Gross (salary)</option>
          </Select>
        </Field>
        {v.entry_mode === 'net' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <MoneyInput value={v.net_amount ?? 0} onChange={(n) => set({ net_amount: n })} />
            </Field>
            <Field label="Frequency">
              <FrequencySelect value={v.frequency} onChange={(f) => set({ frequency: f })} />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Gross annual">
              <MoneyInput value={v.gross_annual ?? 0} onChange={(n) => set({ gross_annual: n })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pension %">
                <TextInput
                  type="number"
                  value={v.pension_rate ?? 0}
                  onChange={(e) => set({ pension_rate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Pension type">
                <Select value={v.pension_type ?? 'relief_at_source'} onChange={(e) => set({ pension_type: e.target.value as PensionType })}>
                  <option value="salary_sacrifice">Salary sacrifice</option>
                  <option value="net_pay">Net pay</option>
                  <option value="relief_at_source">Relief at source</option>
                </Select>
              </Field>
            </div>
            <Field label="Salary-sacrifice items (£/mo)">
              <MoneyInput value={v.sacrifice_monthly ?? 0} onChange={(n) => set({ sacrifice_monthly: n })} />
            </Field>
            <p className="text-xs text-slate-400">Net is estimated from 2026/27 rUK tax — see the Pay calculator for the full breakdown.</p>
          </>
        )}
        <Toggle checked={v.active} onChange={(b) => set({ active: b })} label="Active" />
        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => onSave(v)}>
            Save
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BillEditor({ value, onSave, onClose }: { value: Bill; onSave: (b: Bill) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  const set = (patch: Partial<Bill>) => setV((p) => ({ ...p, ...patch }));
  return (
    <Modal open onClose={onClose} title="Bill">
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Rent" />
        </Field>
        <Field label="Category">
          <TextInput value={v.category ?? ''} onChange={(e) => set({ category: e.target.value })} placeholder="Housing" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput value={v.amount} onChange={(n) => set({ amount: n })} />
          </Field>
          <Field label="Frequency">
            <FrequencySelect value={v.frequency} onChange={(f) => set({ frequency: f })} />
          </Field>
        </div>
        <Toggle checked={v.active} onChange={(b) => set({ active: b })} label="Active" />
        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => onSave(v)}>
            Save
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TargetEditor({ value, onSave, onClose }: { value: SavingsTarget; onSave: (t: SavingsTarget) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  const [isGoal, setIsGoal] = useState(value.target_amount != null);
  const set = (patch: Partial<SavingsTarget>) => setV((p) => ({ ...p, ...patch }));
  return (
    <Modal open onClose={onClose} title="Savings target">
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Emergency fund" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current balance">
            <MoneyInput value={v.balance} onChange={(n) => set({ balance: n })} />
          </Field>
          <Field label="Monthly contribution">
            <MoneyInput value={v.monthly_contribution} onChange={(n) => set({ monthly_contribution: n })} />
          </Field>
        </div>
        <Field label="Annual interest rate (%)">
          <TextInput type="number" value={v.annual_rate} onChange={(e) => set({ annual_rate: Number(e.target.value) })} />
        </Field>
        <Toggle
          checked={isGoal}
          onChange={(b) => {
            setIsGoal(b);
            if (!b) set({ target_amount: null, target_month: null });
            else set({ target_amount: v.target_amount ?? 0, target_month: v.target_month ?? 12 });
          }}
          label="This is a goal (target by date)"
        />
        {isGoal && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target amount">
              <MoneyInput value={v.target_amount ?? 0} onChange={(n) => set({ target_amount: n })} />
            </Field>
            <Field label="By month (offset)">
              <TextInput
                type="number"
                value={v.target_month ?? 12}
                onChange={(e) => set({ target_month: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
        <Toggle checked={v.ring_fenced} onChange={(b) => set({ ring_fenced: b })} label="Ring-fenced" />
        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => onSave(v)}>
            Save
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EventEditor({ value, onSave, onClose }: { value: PlanEvent; onSave: (e: PlanEvent) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  const set = (patch: Partial<PlanEvent>) => setV((p) => ({ ...p, ...patch }));
  return (
    <Modal open onClose={onClose} title="One-off event">
      <div className="space-y-3">
        <Field label="Name">
          <TextInput value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Holiday" />
        </Field>
        <Field label="Total cost">
          <MoneyInput value={v.total_cost} onChange={(n) => set({ total_cost: n })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start month">
            <TextInput type="number" value={v.start_month} onChange={(e) => set({ start_month: Number(e.target.value) })} />
          </Field>
          <Field label="Duration (months)">
            <TextInput type="number" value={v.duration_months} onChange={(e) => set({ duration_months: Number(e.target.value) })} />
          </Field>
        </div>
        <p className="text-xs text-slate-400">Cost is spread evenly across the duration.</p>
        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => onSave(v)}>
            Save
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
