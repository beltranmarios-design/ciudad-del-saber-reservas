import type { Config } from "./types";

/** Versioned storage key. Bump the suffix when the schema changes. */
export const STORAGE_KEY = "campus_mobility_v1";
export const SESSION_KEY = "campus_mobility_session_v1";
export const LANG_KEY = "campus_mobility_lang";
export const OPS_SESSION_KEY = "campus_mobility_ops";

/**
 * DEMO ONLY: local operations access key. This is NOT security — anyone can
 * read it in the bundle. Replace with real authentication when a backend exists.
 */
export const OPS_ACCESS_KEY = "operaciones2026";

export const DEFAULT_CONFIG: Config = {
  maxLoanMinutes: 120,
  batteryThreshold: 20,
  highOccupancy: 80,
  lowOccupancy: 20,
  schedule: { days: [1, 2, 3, 4, 5], open: "07:00", close: "20:00", timeZone: "America/Panama" },
  scheduleOverride: "auto",
};
