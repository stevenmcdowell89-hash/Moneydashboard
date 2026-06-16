import { useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Nav, type Screen } from './components/Nav';
import { ThisMonth } from './screens/ThisMonth';
import { Forecast } from './screens/Forecast';
import { PlanEditor } from './screens/PlanEditor';
import { Settings } from './screens/Settings';
import Dashboard from './screens/Dashboard';
import Scenarios from './screens/Scenarios';
import PayCalculator from './screens/PayCalculator';
import Actuals from './screens/Actuals';
import History from './screens/History';

function SaveIndicator() {
  const { saveState } = useStore();
  const text =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : saveState === 'dirty' ? 'Editing…' : '';
  if (!text) return null;
  return (
    <div
      className={`pointer-events-none fixed right-3 top-3 z-40 rounded-full px-3 py-1 text-xs font-medium shadow-sm ${
        saveState === 'error' ? 'bg-red-100 text-bad' : 'bg-white text-slate-500 ring-1 ring-slate-200'
      }`}
    >
      {text}
    </div>
  );
}

function Router() {
  const { loading, loadError } = useStore();
  const [screen, setScreen] = useState<Screen>('this-month');

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }
  if (loadError) {
    return (
      <div className="mx-auto flex h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium text-bad">Couldn’t load your data</p>
        <p className="text-sm text-slate-500">{loadError}</p>
        <p className="text-xs text-slate-400">
          If you’re behind Cloudflare Access, reload to re-authenticate. In local dev, ensure the Worker is running.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <SaveIndicator />
      {screen === 'this-month' && <ThisMonth />}
      {screen === 'forecast' && <Forecast />}
      {screen === 'dashboard' && <Dashboard />}
      {screen === 'scenarios' && <Scenarios />}
      {screen === 'pay' && <PayCalculator />}
      {screen === 'actuals' && <Actuals />}
      {screen === 'history' && <History />}
      {screen === 'plan' && <PlanEditor />}
      {screen === 'settings' && <Settings />}
      <Nav current={screen} onNavigate={setScreen} />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
