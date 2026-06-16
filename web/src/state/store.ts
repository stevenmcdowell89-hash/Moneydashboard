// Global in-memory plan state with debounced save-on-change.
// A single React context exposes the plan + mutators. Every mutation marks the
// store dirty and schedules a debounced PUT /api/state. UI reads `saveState`
// to render the subtle "saved" indicator.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import { emptyPlan, type PlanState, type TaxConfig } from '../types';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface Store {
  plan: PlanState;
  taxConfig: TaxConfig | null;
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  /** Apply an immutable update to the plan and schedule a save. */
  update: (fn: (draft: PlanState) => PlanState) => void;
  /** Replace the whole plan (e.g. after load) without marking dirty. */
  setPlan: (plan: PlanState) => void;
  setTaxConfig: (cfg: TaxConfig) => void;
  reload: () => Promise<void>;
  /** Force an immediate save (used before snapshots). */
  flush: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

const DEBOUNCE_MS = 800;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [plan, setPlanState] = useState<PlanState>(emptyPlan);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const planRef = useRef(plan);
  planRef.current = plan;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async () => {
    setSaveState('saving');
    try {
      await api.putState(planRef.current);
      setSaveState('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      console.error('save failed', e);
      setSaveState('error');
    }
  }, []);

  const schedule = useCallback(() => {
    setSaveState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(doSave, DEBOUNCE_MS);
  }, [doSave]);

  const update = useCallback(
    (fn: (draft: PlanState) => PlanState) => {
      setPlanState((prev) => {
        const next = fn(prev);
        planRef.current = next;
        return next;
      });
      schedule();
    },
    [schedule],
  );

  const setPlan = useCallback((p: PlanState) => {
    planRef.current = p;
    setPlanState(p);
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await doSave();
  }, [doSave]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, tc] = await Promise.all([
        api.getState(),
        api.getTaxConfig().catch(() => null),
      ]);
      setPlan(s);
      if (tc) setTaxConfig(tc);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [setPlan]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Store>(
    () => ({
      plan,
      taxConfig,
      loading,
      loadError,
      saveState,
      update,
      setPlan,
      setTaxConfig,
      reload,
      flush,
    }),
    [plan, taxConfig, loading, loadError, saveState, update, setPlan, reload, flush],
  );

  return createElement(StoreContext.Provider, { value }, children);
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// ---- tiny id helper for new client-side rows (negative until persisted) ----
let tempId = -1;
export const nextTempId = () => tempId--;
