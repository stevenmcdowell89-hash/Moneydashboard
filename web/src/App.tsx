// Placeholder shell — replaced during integration once screens land.
import { StoreProvider, useStore } from './state/store';

function Shell() {
  const { loading, loadError } = useStore();
  return (
    <div className="p-6 text-center text-slate-500">
      {loading ? 'Loading…' : loadError ? `Error: ${loadError}` : 'Budget & Scenario Planner'}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
