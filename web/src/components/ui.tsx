// Shared UI primitives. Every screen imports from here for a consistent look.
// Tailwind-only, mobile-first. No external UI deps.

import { useEffect, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

// Numeric inputs keep their own text state so a value of 0 shows as an empty
// field with a placeholder (no hard "0" to delete), and partial entries like
// "0." / "1." while typing aren't clobbered. They use a filtered TEXT input
// (inputMode decimal) rather than type=number — on mobile, type=number keyboards
// can commit stray characters when dismissed; we strip anything non-numeric.
//
// Some Android keyboards (notably MIUI/Xiaomi) inject a stray character from the
// "hide keyboard" button at the very moment the keyboard closes. That character
// arrives in the SAME gesture as the field losing focus, so on blur we drop a
// one-char insertion that happened in the last instant — a digit you actually
// typed is always followed by a separate, later action.
function sanitizeNumeric(raw: string): string {
  let t = raw.replace(/[^0-9.]/g, '');
  const dot = t.indexOf('.');
  if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '');
  return t;
}

function useNumericText(value: number | null | undefined, onChange: (n: number) => void) {
  const v = value ?? 0;
  const [text, setText] = useState(v === 0 ? '' : String(v));
  const textRef = useRef(text);
  textRef.current = text;
  const lastInputTs = useRef(0);
  const grewByOne = useRef(false);

  useEffect(() => {
    const parsed = textRef.current === '' ? 0 : Number(textRef.current);
    if (parsed !== v) setText(v === 0 ? '' : String(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const commit = (t: string) => {
    setText(t);
    onChange(t === '' || t === '.' ? 0 : Number(t));
  };

  const handle = (raw: string) => {
    const t = sanitizeNumeric(raw);
    grewByOne.current = t.length === textRef.current.length + 1;
    lastInputTs.current = Date.now();
    commit(t);
  };

  const onBlur = () => {
    // Strip a char that was inserted in the same instant the field blurred AND
    // focus didn't move to another field (i.e. the keyboard was dismissed).
    if (!grewByOne.current || Date.now() - lastInputTs.current > 300) return;
    grewByOne.current = false;
    setTimeout(() => {
      const ae = document.activeElement;
      if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName)) return;
      commit(textRef.current.slice(0, -1));
    }, 0);
  };

  return { text, handle, onBlur };
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-4 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between px-1">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1 rounded-xl font-medium transition disabled:opacity-40 disabled:pointer-events-none';
  const sizes = { sm: 'px-2.5 py-1 text-sm', md: 'px-4 py-2 text-sm' };
  const variants = {
    primary: 'bg-accent text-white hover:bg-blue-700 active:bg-blue-800',
    ghost: 'bg-transparent text-accent hover:bg-blue-50',
    subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    danger: 'bg-red-50 text-bad hover:bg-red-100',
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100 ${className}`}
      {...props}
    />
  );
}

export function MoneyInput({
  value,
  onChange,
  className = '',
  placeholder = '0',
  step = 'any',
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  step?: string;
}) {
  const { text, handle, onBlur } = useNumericText(value, onChange);
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        step={step}
        placeholder={placeholder}
        value={text}
        onChange={(e) => handle(e.target.value)}
        onBlur={onBlur}
        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

// Plain numeric field (percentages, counts) with the same no-hardcoded-0 behaviour.
export function NumberInput({
  value,
  onChange,
  className = '',
  placeholder = '0',
  step = 'any',
  suffix,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  step?: string;
  suffix?: string;
}) {
  const { text, handle, onBlur } = useNumericText(value, onChange);
  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        step={step}
        placeholder={placeholder}
        value={text}
        onChange={(e) => handle(e.target.value)}
        onBlur={onBlur}
        className={`w-full rounded-xl border border-slate-300 bg-white py-2 pl-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100 ${
          suffix ? 'pr-8' : 'pr-3'
        }`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>
      )}
    </div>
  );
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <span
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 rounded-full transition ${checked ? 'bg-accent' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[1.125rem]' : 'left-0.5'}`}
        />
      </span>
      {label && <span className="text-slate-600">{label}</span>}
    </label>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'warn';
}) {
  const tones = {
    default: 'text-ink',
    good: 'text-good',
    bad: 'text-bad',
    warn: 'text-warn',
  };
  return (
    <div className="px-1">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const tones = {
    default: 'bg-slate-100 text-slate-600',
    good: 'bg-green-100 text-good',
    bad: 'bg-red-100 text-bad',
    warn: 'bg-amber-100 text-warn',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-10 text-center">
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-400">{hint}</p>}
      {action}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
    />
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3 className="mb-3 text-lg font-bold">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
