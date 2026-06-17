import { useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Home } from './screens/Home';
import { ScenariosWorkspace } from './screens/ScenariosWorkspace';

function SaveIndicator() {
  const { saveState } = useStore();
  const text =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : '';
  if (!text) return null;
  return (
    <div
      className={`pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium shadow-sm ${
        saveState === 'error' ? 'bg-red-100 text-bad' : 'bg-ink/90 text-white'
      }`}
    >
      {text}
    </div>
  );
}

function Shell() {
  const { loading, loadError } = useStore();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }
  if (loadError) {
    return (
      <div className="mx-auto flex h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium text-bad">Couldn't load your data</p>
        <p className="text-sm text-slate-500">{loadError}</p>
        <p className="text-xs text-slate-400">If you're behind Cloudflare Access, reload to re-authenticate.</p>
      </div>
    );
  }
  const [view, setView] = useState<'home' | 'scenarios'>('home');
  return (
    <>
      {view === 'home' ? (
        <Home onOpenScenarios={() => setView('scenarios')} />
      ) : (
        <ScenariosWorkspace onClose={() => setView('home')} />
      )}
      <SaveIndicator />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
