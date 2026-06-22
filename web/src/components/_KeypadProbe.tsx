// TEMPORARY diagnostic — remove after the MIUI stray-digit bug is pinned down.
// Round 2: box 2 (plain text + inputMode=decimal) tested CLEAN, but the real
// MoneyInput (same inputMode) replaces typed input with "7". So the cause is in
// useNumericText's JS, not the keypad. These variants toggle each handler so we
// can see exactly which one is responsible.
//
// On the MIUI phone open `#probe`, type a number in each box, dismiss with the
// keyboard's hide/down-arrow, and report which boxes change/replace the value.
import { useEffect, useRef, useState } from 'react';
import { MoneyInput } from './ui';

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent';

function sanitize(raw: string): string {
  let t = raw.replace(/[^0-9.]/g, '');
  const dot = t.indexOf('.');
  if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '');
  return t;
}

// Configurable mirror of useNumericText so we can turn features on/off.
function useProbeText(opts: { select: boolean; blur: boolean }) {
  const [value, setValue] = useState<number>(0);
  const v = value;
  const [text, setText] = useState(v === 0 ? '' : String(v));
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    const parsed = textRef.current === '' ? 0 : Number(textRef.current);
    if (parsed !== v) setText(v === 0 ? '' : String(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  const onChange = (raw: string) => {
    const t = sanitize(raw);
    setText(t);
    setValue(t === '' || t === '.' ? 0 : Number(t));
  };
  const props: Record<string, unknown> = {
    className: field,
    type: 'text',
    inputMode: 'decimal',
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
  };
  if (opts.select) props.onFocus = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();
  if (opts.blur) props.onBlur = () => setText(v === 0 ? '' : String(v));
  return { props, value };
}

function Variant({ label, select, blur }: { label: string; select: boolean; blur: boolean }) {
  const { props, value } = useProbeText({ select, blur });
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>
      <input {...(props as React.InputHTMLAttributes<HTMLInputElement>)} />
      <div className="mt-1 text-xs text-slate-400">value: <span className="font-mono text-slate-700">{value}</span></div>
    </div>
  );
}

export function KeypadProbe() {
  const [money, setMoney] = useState<number>(0);
  const [plainVal, setPlainVal] = useState('');
  return (
    <div className="mb-4 space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
      <div className="text-sm font-bold text-amber-900">Keypad probe — round 2</div>
      <p className="text-xs text-amber-800">
        Type a number in each box, then close the keyboard with the hide/down-arrow.
        Report which boxes change or replace what you typed.
      </p>

      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <div className="mb-1 text-xs font-semibold text-slate-600">A. plain text + inputMode=decimal (known CLEAN)</div>
        <input className={field} type="text" inputMode="decimal" defaultValue="" onChange={(e) => setPlainVal(e.target.value)} />
        <div className="mt-1 text-xs text-slate-400">value: <span className="font-mono text-slate-700">{plainVal || '(empty)'}</span></div>
      </div>

      <Variant label="B. controlled, NO select-on-focus, NO blur-normalise" select={false} blur={false} />
      <Variant label="C. controlled + select-on-focus only" select blur={false} />
      <Variant label="D. controlled + blur-normalise only" select={false} blur />

      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <div className="mb-1 text-xs font-semibold text-slate-600">E. real MoneyInput (select + blur — known BROKEN)</div>
        <MoneyInput value={money} onChange={setMoney} />
        <div className="mt-1 text-xs text-slate-400">value: <span className="font-mono text-slate-700">{money}</span></div>
      </div>
    </div>
  );
}
