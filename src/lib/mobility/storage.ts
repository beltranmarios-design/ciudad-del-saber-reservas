// Persistence adapter. This is the ONLY module that touches localStorage for
// domain data — replace it with an API client when a real backend exists.
import { STORAGE_KEY } from "./constants";
import { createSeedState } from "./seed";
import { normalizeLowBattery } from "./rules";
import type { AppState, ErrorCode, OpResult } from "./types";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LoadResult =
  | { status: "ok"; state: AppState; seeded: boolean }
  | { status: "corrupt"; raw: string }
  | { status: "blocked" };

export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__cm_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const isArr = Array.isArray;

export function validateState(x: unknown): x is AppState {
  if (!x || typeof x !== "object") return false;
  const s = x as AppState;
  if ((s.version as number) !== 1 && s.version !== 2) return false;
  if (typeof s.initializedAt !== "number") return false;
  if (![s.organizations, s.users, s.stations, s.vehicles, s.loans, s.movements].every(isArr)) return false;
  if (!s.config || typeof s.config.maxLoanMinutes !== "number" || !s.config.schedule) return false;
  const stationIds = new Set(s.stations.map((st) => st.id));
  for (const v of s.vehicles) {
    if (typeof v.code !== "string" || (v.type !== "bike" && v.type !== "scooter")) return false;
    if (v.status === "loaned" ? v.stationId !== null : !stationIds.has(v.stationId ?? "")) return false;
    if (v.type === "scooter" && (typeof v.battery !== "number" || v.battery < 0 || v.battery > 100)) return false;
  }
  for (const l of s.loans) {
    if (l.status === "active" && s.vehicles.find((v) => v.id === l.vehicleId)?.status !== "loaned") return false;
  }
  return true;
}

export const CURRENT_VERSION = 2;

/**
 * Versioned, non-destructive migrations. v1 -> v2: parked scooters shown as
 * "available" with battery <= threshold become "charging". Loans, history,
 * locations and every other change are kept as they are.
 */
export function migrateState(s: AppState): { state: AppState; migrated: boolean } {
  let cur = s;
  let migrated = false;
  if ((cur.version as number) === 1) {
    cur = { ...normalizeLowBattery(cur), version: 2 };
    migrated = true;
  }
  return { state: cur, migrated };
}

export function loadState(storage: StorageLike | null, now = Date.now()): LoadResult {
  if (!storage) return { status: "blocked" };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: "blocked" };
  }
  if (raw === null) {
    const state = createSeedState(now);
    const saved = saveState(storage, state);
    if (!saved.ok) return { status: "blocked" };
    return { status: "ok", state, seeded: true };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!validateState(parsed)) return { status: "corrupt", raw };
    const { state, migrated } = migrateState(parsed);
    if (migrated) saveState(storage, state); // best effort; re-applied next load if it fails
    return { status: "ok", state, seeded: false };
  } catch {
    return { status: "corrupt", raw };
  }
}

export function saveState(
  storage: StorageLike | null,
  state: AppState,
): { ok: true } | { ok: false; error: ErrorCode; reason: "quota" | "blocked" } {
  if (!storage) return { ok: false, error: "storage_unavailable", reason: "blocked" };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return { ok: false, error: "save_failed", reason: quota ? "quota" : "blocked" };
  }
}

/**
 * Atomic-ish commit: re-read the stored state (another tab may have changed it),
 * run the pure operation, then persist the whole new state. Success is reported
 * only after the write succeeds.
 */
export function commitOperation<T extends OpResult<object>>(
  storage: StorageLike | null,
  op: (state: AppState) => T,
  now = Date.now(),
): T | { ok: false; error: ErrorCode; params?: Record<string, string | number> } {
  const loaded = loadState(storage, now);
  if (loaded.status === "blocked") return { ok: false, error: "storage_unavailable" };
  if (loaded.status === "corrupt") return { ok: false, error: "storage_corrupt" };
  const res = op(loaded.state);
  if (!res.ok) return res;
  const saved = saveState(storage, res.state);
  if (!saved.ok) return { ok: false, error: "save_failed" };
  return res;
}

export function resetState(storage: StorageLike | null, now = Date.now()) {
  const state = createSeedState(now);
  const saved = saveState(storage, state);
  return saved.ok ? { ok: true as const, state } : { ok: false as const, error: saved.error };
}
