// TEMPORARY diagnostic — remove after the MIUI keypad bug is pinned down.
// Open the app at `#probe` on the Xiaomi/MIUI phone. Type a number into each
// field, then dismiss the keyboard with the keyboard's hide/down-arrow, and note
// which fields gained a stray digit. Each field is independent so we can isolate
// exactly which attribute (inputMode / type / controlled buffer) triggers it.
import { useState } from 'react';
import { MoneyInput } from './ui';

function Probe({ label, render }: { label: string; render: (onVal: (s: string) => void) => React.ReactNode }) {
  const [val, setVal] = useState('');
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>
      {render(setVal)}
      <div className="mt-1 text-xs text-slate-400">
        value: <span className="font-mono text-slate-700">{val === '' ? '(empty)' : JSON.stringify(val)}</span>
      </div>
    </div>
  );
}

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent';

export function KeypadProbe() {
  const [money, setMoney] = useState<number>(0);
  return (
    <div className="mb-4 space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
      <div className="text-sm font-bold text-amber-900">Keypad probe</div>
      <p className="text-xs text-amber-800">
        Type a number in each box, then close the keyboard with the keyboard's
        hide/down-arrow. Tell me which boxes gained a stray digit (and which didn't).
      </p>

      <Probe
        label="1. bare text — no inputMode (like Reddit / Claude)"
        render={(onVal) => (
          <input className={field} type="text" defaultValue="" onChange={(e) => onVal(e.target.value)} />
        )}
      />
      <Probe
        label="2. text + inputMode=decimal (what the app uses now)"
        render={(onVal) => (
          <input className={field} type="text" inputMode="decimal" defaultValue="" onChange={(e) => onVal(e.target.value)} />
        )}
      />
      <Probe
        label="3. text + inputMode=numeric"
        render={(onVal) => (
          <input className={field} type="text" inputMode="numeric" defaultValue="" onChange={(e) => onVal(e.target.value)} />
        )}
      />
      <Probe
        label="4. type=tel"
        render={(onVal) => (
          <input className={field} type="tel" defaultValue="" onChange={(e) => onVal(e.target.value)} />
        )}
      />
      <Probe
        label="5. type=number"
        render={(onVal) => (
          <input className={field} type="number" defaultValue="" onChange={(e) => onVal(e.target.value)} />
        )}
      />

      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <div className="mb-1 text-xs font-semibold text-slate-600">6. the real MoneyInput (controlled + decimal)</div>
        <MoneyInput value={money} onChange={setMoney} />
        <div className="mt-1 text-xs text-slate-400">
          value: <span className="font-mono text-slate-700">{money}</span>
        </div>
      </div>
    </div>
  );
}
