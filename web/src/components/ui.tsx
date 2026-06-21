// Shared UI primitives. Every screen imports from here for a consistent look.
// Tailwind-only, mobile-first. No external UI deps.

import { useEffect, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

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

// Parse a (possibly partial) user-typed numeric string. Returns null while the
// field is blank or mid-edit (e.g. "", "-", "."), so callers can keep a clean
// number without the input fighting the keystrokes.
function parseNumeric(s: string): number | null {
  const t = s.trim();
  if (t === '' || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const INT_RE = /^-?\d*$/;
const DEC_RE = /^-?\d*\.?\d*$/;

// Buffered numeric field. Renders a text input (not type="number") so it never
// reformats or injects digits while you type — decimals, clearing the field and
// the on-screen keyboard "done" all behave normally. The displayed text is a
// local buffer; the parsed number is reported through onChange, and the buffer
// re-syncs from the prop only while the field is unfocused.
function useNumericBuffer(value: number | null | undefined, focused: boolean) {
  const [text, setText] = useState(() => (value == null ? '' : String(value)));
  useEffect(() => {
    if (!focused) setText(value == null ? '' : String(value));
  }, [value, focused]);
  return [text, setText] as const;
}

export function MoneyInput({
  value,
  onChange,
  className = '',
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  /** Accepted for call-site compatibility; not used by the text buffer. */
  step?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useNumericBuffer(value, focused);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw !== '' && !DEC_RE.test(raw)) return; // ignore stray characters
          setText(raw);
          onChange(parseNumeric(raw) ?? 0);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parseNumeric(text);
          setText(n == null ? '' : String(n));
          onChange(n ?? 0);
        }}
        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

// Buffered plain number field (no £ prefix) for rates, percentages and month
// offsets. Same robust typing behaviour as MoneyInput. onChange receives null
// when the field is blank, so callers can keep nullable values or coerce to 0.
export function NumberInput({
  value,
  onChange,
  className = '',
  placeholder,
  integer = false,
  min,
  max,
}: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  className?: string;
  placeholder?: string;
  integer?: boolean;
  min?: number;
  max?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useNumericBuffer(value, focused);
  const re = integer ? INT_RE : DEC_RE;

  const clamp = (n: number) => {
    let v = n;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  };

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== '' && !re.test(raw)) return; // ignore stray characters
        setText(raw);
        const n = parseNumeric(raw);
        onChange(n == null ? null : n); // clamp on blur, not mid-typing
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseNumeric(text);
        if (n == null) {
          setText('');
          onChange(null);
          return;
        }
        const v = clamp(n);
        setText(String(v));
        onChange(v);
      }}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100 ${className}`}
    />
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
