import { useMemo, useState } from 'react';
import { useStore, nextTempId } from '../state/store';
import { monthlyBillAmount } from '../engine';
import { FREQUENCIES, gbp, type Bill, type Frequency } from '../types';
import { Button, MoneyInput, Select, TextInput, Toggle } from './ui';

const UNCATEGORISED = 'Other';

function blankBill(isSavings: boolean): Bill {
  return {
    id: nextTempId(),
    name: '',
    category: isSavings ? 'Savings' : '',
    amount: 0,
    frequency: 'Monthly',
    active: true,
    is_savings: isSavings,
    balance: 0,
    track_actuals: false,
  };
}

function BillEditor({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const { update } = useStore();
  const patch = (p: Partial<Bill>) =>
    update((d) => ({ ...d, bills: d.bills.map((b) => (b.id === bill.id ? { ...b, ...p } : b)) }));
  const remove = () => {
    update((d) => ({ ...d, bills: d.bills.filter((b) => b.id !== bill.id) }));
    onClose();
  };

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Name</span>
          <TextInput value={bill.name} onChange={(e) => patch({ name: e.target.value })} placeholder={bill.is_savings ? 'Holiday savings' : 'Rent'} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Amount</span>
          <MoneyInput value={bill.amount} onChange={(n) => patch({ amount: n })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Every</span>
          <Select value={bill.frequency} onChange={(e) => patch({ frequency: e.target.value as Frequency })}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Category</span>
          <TextInput value={bill.category ?? ''} onChange={(e) => patch({ category: e.target.value })} placeholder="Housing" />
        </label>
        {bill.is_savings && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Current balance</span>
            <MoneyInput value={bill.balance} onChange={(n) => patch({ balance: n })} />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        <Toggle checked={bill.is_savings} onChange={(b) => patch({ is_savings: b, category: b && !bill.category ? 'Savings' : bill.category })} label="Savings (sets money aside)" />
        {!bill.is_savings && (
          <Toggle checked={bill.track_actuals} onChange={(b) => patch({ track_actuals: b })} label="Variable — track spend" />
        )}
        <Toggle checked={bill.active} onChange={(b) => patch({ active: b })} label="Active" />
        <button onClick={remove} className="ml-auto text-sm font-medium text-bad">Delete</button>
      </div>
    </div>
  );
}

function Group({
  name,
  bills,
  openId,
  setOpenId,
}: {
  name: string;
  bills: Bill[];
  openId: number | null;
  setOpenId: (id: number | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const subtotal = bills.reduce((s, b) => s + monthlyBillAmount(b), 0);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <span className={`text-slate-400 transition ${collapsed ? '-rotate-90' : ''}`}>▾</span>
          {name}
          <span className="rounded-full bg-slate-100 px-1.5 text-xs font-normal text-slate-400">{bills.length}</span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-slate-700">{gbp(subtotal)}<span className="text-xs font-normal text-slate-400">/mo</span></span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {bills.map((b) => (
            <div key={b.id}>
              <button onClick={() => setOpenId(openId === b.id ? null : b.id)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {b.name || <span className="text-slate-400">Untitled</span>}
                  {b.is_savings && <span className="ml-2 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-good">saving</span>}
                  {!b.active && <span className="ml-2 text-[10px] text-slate-400">off</span>}
                </span>
                <span className="text-sm tabular-nums text-slate-700">{gbp(monthlyBillAmount(b))}</span>
              </button>
              {openId === b.id && <BillEditor bill={b} onClose={() => setOpenId(null)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OutgoingsSection() {
  const { plan, update } = useStore();
  const [openId, setOpenId] = useState<number | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of plan.bills) {
      const key = (b.category && b.category.trim()) || UNCATEGORISED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [plan.bills]);

  const addBill = (isSavings: boolean) => {
    const b = blankBill(isSavings);
    update((d) => ({ ...d, bills: [...d.bills, b] }));
    setOpenId(b.id);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Outgoings</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="subtle" onClick={() => addBill(true)}>+ Savings</Button>
          <Button size="sm" onClick={() => addBill(false)}>+ Bill</Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-8 text-center text-sm text-slate-400">
          Add your bills and savings — tap <b>+ Bill</b> to start.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(([name, bills]) => (
            <Group key={name} name={name} bills={bills} openId={openId} setOpenId={setOpenId} />
          ))}
        </div>
      )}
    </section>
  );
}
