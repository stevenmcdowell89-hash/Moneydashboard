// Bottom navigation. Core two screens (This Month, Forecast) sit up front;
// everything else lives behind "More".
import { useState } from 'react';

export type Screen =
  | 'this-month'
  | 'forecast'
  | 'scenarios'
  | 'pay'
  | 'actuals'
  | 'history'
  | 'dashboard'
  | 'plan'
  | 'settings';

const PRIMARY: { id: Screen; label: string; icon: string }[] = [
  { id: 'this-month', label: 'This Month', icon: '💷' },
  { id: 'forecast', label: 'Forecast', icon: '📈' },
];

const MORE: { id: Screen; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'scenarios', label: 'Scenarios', icon: '🔀' },
  { id: 'pay', label: 'Pay calculator', icon: '🧮' },
  { id: 'actuals', label: 'Actuals', icon: '✅' },
  { id: 'history', label: 'History', icon: '🕑' },
  { id: 'plan', label: 'Plan editor', icon: '✏️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Nav({ current, onNavigate }: { current: Screen; onNavigate: (s: Screen) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => m.id === current);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute bottom-16 left-1/2 w-[92%] max-w-md -translate-x-1/2 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
            <div className="grid grid-cols-2 gap-1">
              {MORE.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onNavigate(m.id);
                    setMoreOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm ${
                    current === m.id ? 'bg-blue-50 text-accent' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {PRIMARY.map((p) => (
            <button
              key={p.id}
              onClick={() => onNavigate(p.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                current === p.id ? 'text-accent' : 'text-slate-500'
              }`}
            >
              <span className="text-xl">{p.icon}</span>
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              moreActive || moreOpen ? 'text-accent' : 'text-slate-500'
            }`}
          >
            <span className="text-xl">⋯</span>
            More
          </button>
        </div>
      </nav>
    </>
  );
}
