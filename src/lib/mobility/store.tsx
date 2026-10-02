import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SESSION_KEY, STORAGE_KEY } from "./constants";
import { commitOperation, getBrowserStorage, loadState, resetState } from "./storage";
import type { AppState, ErrorCode, OpResult } from "./types";

type LoadStatus = "loading" | "ok" | "blocked" | "corrupt";

interface Store {
  status: LoadStatus;
  state: AppState | null;
  corruptRaw: string | null;
  /** Re-reads storage, applies op, persists; updates UI only if persisted. */
  run: <T extends OpResult<object>>(op: (s: AppState) => T) => T | { ok: false; error: ErrorCode; params?: Record<string, string | number> };
  reset: () => boolean;
  reload: () => void;
  sessionCredential: string | null;
  setSessionCredential: (c: string | null) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, syncMessage }: { children: ReactNode; syncMessage: string }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [state, setState] = useState<AppState | null>(null);
  const [corruptRaw, setCorruptRaw] = useState<string | null>(null);
  const [sessionCredential, setSession] = useState<string | null>(null);

  const reload = useCallback(() => {
    const res = loadState(getBrowserStorage());
    if (res.status === "ok") {
      setState(res.state);
      setCorruptRaw(null);
    }
    if (res.status === "corrupt") setCorruptRaw(res.raw);
    setStatus(res.status);
  }, []);

  useEffect(() => {
    reload();
    try {
      setSession(localStorage.getItem(SESSION_KEY));
    } catch {
      /* blocked */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        reload();
        toast.info(syncMessage);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload, syncMessage]);

  const run: Store["run"] = useCallback((op) => {
    const res = commitOperation(getBrowserStorage(), op);
    if (res.ok) setState(res.state);
    else if (res.error === "storage_corrupt") reload();
    return res;
  }, [reload]);

  const reset = useCallback(() => {
    const r = resetState(getBrowserStorage());
    if (r.ok) {
      setState(r.state);
      setStatus("ok");
      setCorruptRaw(null);
    }
    return r.ok;
  }, []);

  const setSessionCredential = useCallback((c: string | null) => {
    setSession(c);
    try {
      if (c) localStorage.setItem(SESSION_KEY, c);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <Ctx.Provider value={{ status, state, corruptRaw, run, reset, reload, sessionCredential, setSessionCredential }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}

/** Ticking clock that also refreshes on window focus / visibility. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, intervalMs);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);
  return now;
}
