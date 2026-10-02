// Pure business rules. Every operation takes a state and returns a NEW state
// (or an error) without side effects, so it can be persisted atomically.
import type {
  AppState,
  Config,
  ErrorCode,
  Loan,
  OpResult,
  Station,
  Vehicle,
  VehicleStatus,
  VehicleType,
} from "./types";

const MIN = 60_000;

const fail = (error: ErrorCode, params?: Record<string, string | number>) =>
  ({ ok: false, error, params }) as const;

let idCounter = 0;
export function newId(prefix: string, now: number): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}-${now.toString(36)}-${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

// ---------- Capacity & availability ----------

export function isEligible(v: Vehicle, cfg: Config): boolean {
  if (v.status !== "available" || !v.stationId) return false;
  if (v.type === "scooter") return (v.battery ?? 0) > cfg.batteryThreshold;
  return true;
}

export interface StationStats {
  station: Station;
  present: Vehicle[];
  occupancy: number;
  free: number;
  pct: number;
  full: boolean;
  presentBikes: number;
  presentScooters: number;
  availableBikes: number;
  eligibleScooters: number;
}

export function stationStats(state: AppState, station: Station): StationStats {
  const present = state.vehicles.filter((v) => v.stationId === station.id && v.status !== "loaned");
  const occupancy = present.length;
  const free = Math.max(0, station.capacity - occupancy);
  return {
    station,
    present,
    occupancy,
    free,
    pct: station.capacity > 0 ? (occupancy / station.capacity) * 100 : 0,
    full: free <= 0,
    presentBikes: present.filter((v) => v.type === "bike").length,
    presentScooters: present.filter((v) => v.type === "scooter").length,
    availableBikes: present.filter((v) => v.type === "bike" && isEligible(v, state.config)).length,
    eligibleScooters: present.filter((v) => v.type === "scooter" && isEligible(v, state.config)).length,
  };
}

export function allStationStats(state: AppState): StationStats[] {
  return state.stations.map((s) => stationStats(state, s));
}

/** Deterministic assignment: scooters by highest battery then code; bikes by code. */
export function pickVehicle(state: AppState, stationId: string, type: VehicleType): Vehicle | undefined {
  const candidates = state.vehicles.filter(
    (v) => v.stationId === stationId && v.type === type && isEligible(v, state.config),
  );
  candidates.sort((a, b) =>
    type === "scooter"
      ? (b.battery ?? 0) - (a.battery ?? 0) || a.code.localeCompare(b.code)
      : a.code.localeCompare(b.code),
  );
  return candidates[0];
}

/** Why a station has no eligible vehicle of a type (for user-facing explanations). */
export function ineligibleReason(
  state: AppState,
  stationId: string,
  type: VehicleType,
): "none_present" | "maintenance_or_charging" | "low_battery" | null {
  const present = state.vehicles.filter((v) => v.stationId === stationId && v.type === type);
  if (present.some((v) => isEligible(v, state.config))) return null;
  if (present.length === 0) return "none_present";
  if (type === "scooter" && present.some((v) => v.status === "available")) return "low_battery";
  return "maintenance_or_charging";
}

// ---------- Schedule (America/Panama) ----------

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: WEEKDAYS[get("weekday")] ?? 0, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Pickups allowed from open (inclusive) until close (exclusive). Returns are always allowed. */
export function isServiceOpen(now: number, cfg: Config): boolean {
  if (cfg.scheduleOverride === "open") return true;
  if (cfg.scheduleOverride === "closed") return false;
  const { weekday, minutes } = zonedParts(now, cfg.schedule.timeZone);
  return (
    cfg.schedule.days.includes(weekday) &&
    minutes >= toMinutes(cfg.schedule.open) &&
    minutes < toMinutes(cfg.schedule.close)
  );
}

/**
 * Latest instant <= t (minute precision) at which pickups are allowed by the REAL
 * schedule (ignores the demo override). Used to generate coherent demo dates.
 */
export function latestServiceInstant(t: number, schedule: Config["schedule"]): number {
  const open = toMinutes(schedule.open);
  const close = toMinutes(schedule.close);
  let cur = Math.floor(t / MIN) * MIN;
  for (let i = 0; i < 14; i++) {
    const { weekday, minutes } = zonedParts(cur, schedule.timeZone);
    const day = schedule.days.includes(weekday);
    if (day && minutes >= open && minutes < close) return cur;
    if (day && minutes >= close) cur -= (minutes - close + 1) * MIN; // last open minute today
    else cur -= (minutes + 1) * MIN; // 23:59 of the previous day
  }
  return cur;
}

/** Instant at local time hh:mm on the n-th service day before t's local day. */
export function serviceDayAt(t: number, daysBack: number, hhmm: string, schedule: Config["schedule"]): number {
  let cur = Math.floor(t / MIN) * MIN;
  let left = daysBack;
  for (let guard = 0; guard < 60 && left > 0; guard++) {
    cur -= 24 * 60 * MIN;
    if (schedule.days.includes(zonedParts(cur, schedule.timeZone).weekday)) left--;
  }
  const { minutes } = zonedParts(cur, schedule.timeZone);
  return cur + (toMinutes(hhmm) - minutes) * MIN;
}

// ---------- Loans ----------

export const maxLoanMs = (cfg: Config) => cfg.maxLoanMinutes * MIN;
/** Overdue only when duration strictly exceeds the maximum. */
export const isOverdueDuration = (durationMs: number, cfg: Config) => durationMs > maxLoanMs(cfg);

export function loanIsOverdue(loan: Loan, now: number, cfg: Config): boolean {
  if (loan.status === "returned") return !!loan.overdue;
  return isOverdueDuration(now - loan.startAt, cfg);
}

export const activeLoanOf = (state: AppState, userId: string) =>
  state.loans.find((l) => l.userId === userId && l.status === "active");

export const findUserByCredential = (state: AppState, credential: string) => {
  const c = credential.trim().toUpperCase();
  return state.users.find((u) => u.credential.toUpperCase() === c);
};

export interface CheckoutInput {
  credential: string;
  stationId: string;
  type: VehicleType;
  now: number;
}

export function previewCheckout(state: AppState, input: CheckoutInput) {
  const station = state.stations.find((s) => s.id === input.stationId);
  if (!station) return fail("station_not_found");
  const user = findUserByCredential(state, input.credential);
  if (!user) return fail("credential_not_found");
  if (!user.active) return fail("user_inactive");
  if (activeLoanOf(state, user.id)) return fail("user_has_active_loan");
  if (!isServiceOpen(input.now, state.config)) return fail("outside_service_hours");
  const vehicle = pickVehicle(state, station.id, input.type);
  if (!vehicle) return fail("no_eligible_vehicle");
  return { ok: true as const, user, station, vehicle, dueAt: input.now + maxLoanMs(state.config) };
}

export function checkout(state: AppState, input: CheckoutInput): OpResult<{ loan: Loan }> {
  const p = previewCheckout(state, input);
  if (!p.ok) return p;
  const loan: Loan = {
    id: newId("L", input.now),
    userId: p.user.id,
    vehicleId: p.vehicle.id,
    originStationId: p.station.id,
    startAt: input.now,
    dueAt: p.dueAt,
    status: "active",
  };
  return {
    ok: true,
    loan,
    state: {
      ...state,
      vehicles: state.vehicles.map((v) =>
        v.id === p.vehicle.id ? { ...v, status: "loaned" as const, stationId: null } : v,
      ),
      loans: [...state.loans, loan],
    },
  };
}

export interface ReturnInput {
  loanId: string;
  stationId: string;
  battery?: number;
  now: number;
}

export function isValidBattery(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}

export function returnVehicle(state: AppState, input: ReturnInput): OpResult<{ loan: Loan }> {
  const loan = state.loans.find((l) => l.id === input.loanId);
  if (!loan) return fail("loan_not_found");
  if (loan.status !== "active") return fail("loan_not_active");
  const station = state.stations.find((s) => s.id === input.stationId);
  if (!station) return fail("station_not_found");
  const vehicle = state.vehicles.find((v) => v.id === loan.vehicleId);
  if (!vehicle) return fail("vehicle_not_found");
  if (stationStats(state, station).free <= 0) return fail("station_full");

  let battery = vehicle.battery;
  let status: VehicleStatus = "available";
  if (vehicle.type === "scooter") {
    if (!isValidBattery(input.battery)) return fail("invalid_battery");
    battery = input.battery;
    if (battery <= state.config.batteryThreshold) status = "charging";
  }
  const durationMs = Math.max(0, input.now - loan.startAt);
  const closed: Loan = {
    ...loan,
    status: "returned",
    returnStationId: station.id,
    returnedAt: input.now,
    durationMs,
    overdue: isOverdueDuration(durationMs, state.config),
  };
  return {
    ok: true,
    loan: closed,
    state: {
      ...state,
      vehicles: state.vehicles.map((v) =>
        v.id === vehicle.id ? { ...v, status, stationId: station.id, battery } : v,
      ),
      loans: state.loans.map((l) => (l.id === loan.id ? closed : l)),
    },
  };
}

/** Stations with free space, emptiest first — used as suggestions when the chosen one is full. */
export function stationsWithSpace(state: AppState, exceptId?: string) {
  return allStationStats(state)
    .filter((s) => s.free > 0 && s.station.id !== exceptId)
    .sort((a, b) => b.free - a.free || a.station.name.localeCompare(b.station.name));
}

// ---------- Fleet operations ----------

/**
 * Coherence rule: a PARKED scooter marked available with battery <= threshold is
 * not really available — it goes to charging. Loaned / maintenance are untouched.
 */
export function normalizeLowBattery(state: AppState): AppState {
  let changed = false;
  const vehicles = state.vehicles.map((v) => {
    if (
      v.type === "scooter" &&
      v.status === "available" &&
      v.stationId &&
      (v.battery ?? 0) <= state.config.batteryThreshold
    ) {
      changed = true;
      return { ...v, status: "charging" as const };
    }
    return v;
  });
  return changed ? { ...state, vehicles } : state;
}

export function setVehicleStatus(
  state: AppState,
  vehicleId: string,
  status: Exclude<VehicleStatus, "loaned">,
): OpResult {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return fail("vehicle_not_found");
  if (v.status === "loaned" || !v.stationId) return fail("vehicle_loaned");
  if (status === "charging" && v.type !== "scooter") return fail("not_a_scooter");
  if (status === "available" && v.type === "scooter" && (v.battery ?? 0) <= state.config.batteryThreshold)
    return fail("battery_too_low", { threshold: state.config.batteryThreshold });
  return { ok: true, state: { ...state, vehicles: state.vehicles.map((x) => (x.id === v.id ? { ...x, status } : x)) } };
}

export function setBattery(state: AppState, vehicleId: string, battery: number): OpResult {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return fail("vehicle_not_found");
  if (v.type !== "scooter") return fail("not_a_scooter");
  if (v.status === "loaned") return fail("vehicle_loaned");
  if (!isValidBattery(battery)) return fail("invalid_battery");
  // An available scooter that falls to/below the threshold goes to charging automatically.
  const status: VehicleStatus =
    v.status === "available" && battery <= state.config.batteryThreshold ? "charging" : v.status;
  return {
    ok: true,
    state: { ...state, vehicles: state.vehicles.map((x) => (x.id === v.id ? { ...x, battery, status } : x)) },
  };
}

export function setCapacity(state: AppState, stationId: string, capacity: number): OpResult {
  const st = state.stations.find((s) => s.id === stationId);
  if (!st) return fail("station_not_found");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) return fail("invalid_capacity");
  const occ = stationStats(state, st).occupancy;
  if (capacity < occ) return fail("capacity_below_occupancy", { occupancy: occ });
  return { ok: true, state: { ...state, stations: state.stations.map((s) => (s.id === st.id ? { ...s, capacity } : s)) } };
}

// ---------- Users & organizations ----------

export const CREDENTIAL_PATTERN = /^[A-Z0-9-]{4,20}$/;

export function addUser(
  state: AppState,
  input: { name: string; orgId: string; credential: string },
  now: number,
): OpResult {
  const name = input.name.trim();
  const credential = input.credential.trim().toUpperCase();
  if (name.length < 2) return fail("invalid_name");
  if (!CREDENTIAL_PATTERN.test(credential)) return fail("invalid_credential");
  if (!state.organizations.some((o) => o.id === input.orgId)) return fail("org_not_found");
  if (findUserByCredential(state, credential)) return fail("duplicate_credential");
  return {
    ok: true,
    state: { ...state, users: [...state.users, { id: newId("u", now), name, orgId: input.orgId, credential, active: true }] },
  };
}

export function setUserActive(state: AppState, userId: string, active: boolean): OpResult {
  if (!state.users.some((u) => u.id === userId)) return fail("credential_not_found");
  return { ok: true, state: { ...state, users: state.users.map((u) => (u.id === userId ? { ...u, active } : u)) } };
}

export function addOrganization(state: AppState, name: string, now: number): OpResult {
  const n = name.trim();
  if (n.length < 2 || state.organizations.some((o) => o.name.toLowerCase() === n.toLowerCase()))
    return fail("invalid_name");
  return { ok: true, state: { ...state, organizations: [...state.organizations, { id: newId("org", now), name: n }] } };
}

// ---------- Config ----------

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateConfig(cfg: Config): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(cfg.maxLoanMinutes) || cfg.maxLoanMinutes < 1 || cfg.maxLoanMinutes > 1440)
    errors.push("maxLoanMinutes");
  if (!isValidBattery(cfg.batteryThreshold)) errors.push("batteryThreshold");
  if (!isValidBattery(cfg.lowOccupancy)) errors.push("lowOccupancy");
  if (!isValidBattery(cfg.highOccupancy) || cfg.highOccupancy <= cfg.lowOccupancy) errors.push("highOccupancy");
  if (!HHMM.test(cfg.schedule.open)) errors.push("open");
  if (!HHMM.test(cfg.schedule.close) || (HHMM.test(cfg.schedule.open) && toMinutes(cfg.schedule.close) <= toMinutes(cfg.schedule.open)))
    errors.push("close");
  if (cfg.schedule.days.length === 0) errors.push("days");
  return errors;
}

export function updateConfig(state: AppState, cfg: Config): OpResult {
  if (validateConfig(cfg).length) return fail("invalid_config");
  return { ok: true, state: normalizeLowBattery({ ...state, config: cfg }) };
}

// ---------- Redistribution ----------

export interface Suggestion {
  key: string;
  originId: string;
  destId: string;
  vehicleIds: string[];
  bikes: number;
  scooters: number;
  before: { origin: number; dest: number };
  after: { origin: number; dest: number };
}

/**
 * Deterministic plan: origins are stations with occupancy strictly above the high
 * threshold, destinations strictly below the low threshold. Destinations are served
 * lowest-occupancy first (ties by station order). Each origin gives available,
 * eligible vehicles towards 50% for both sides, within capacity. Computed on a copy
 * of the state, updated after every move, so a vehicle is never used twice.
 */
export function planRedistribution(state: AppState): Suggestion[] {
  const cfg = state.config;
  const order = new Map(state.stations.map((s, i) => [s.id, i]));
  const loc = new Map(state.vehicles.map((v) => [v.id, v.stationId]));
  const used = new Set<string>();
  const present = (id: string) => state.vehicles.filter((v) => loc.get(v.id) === id && v.status !== "loaned").length;
  const cap = (id: string) => state.stations.find((s) => s.id === id)!.capacity;
  const pct = (id: string) => (present(id) / cap(id)) * 100;

  const origins = state.stations.filter((s) => pct(s.id) > cfg.highOccupancy).map((s) => s.id);
  const dests = state.stations
    .filter((s) => pct(s.id) < cfg.lowOccupancy)
    .map((s) => s.id)
    .sort((a, b) => pct(a) - pct(b) || order.get(a)! - order.get(b)!);
  if (!origins.length || !dests.length) return [];

  const out: Suggestion[] = [];
  for (const d of dests) {
    let need = Math.floor(cap(d) * 0.5) - present(d);
    while (need > 0) {
      const ranked = origins
        .map((o) => ({ o, give: present(o) - Math.ceil(cap(o) * 0.5) }))
        .filter((x) => x.give > 0)
        .sort((a, b) => pct(b.o) - pct(a.o) || order.get(a.o)! - order.get(b.o)!);
      let moved = false;
      for (const { o, give } of ranked) {
        const movable = state.vehicles
          .filter((v) => loc.get(v.id) === o && !used.has(v.id) && isEligible(v, cfg))
          .sort((a, b) => a.code.localeCompare(b.code));
        const free = cap(d) - present(d);
        const n = Math.min(need, give, movable.length, free);
        if (n <= 0) continue;
        const before = { origin: pct(o), dest: pct(d) };
        const chosen = movable.slice(0, n);
        for (const v of chosen) {
          loc.set(v.id, d);
          used.add(v.id);
        }
        out.push({
          key: `${o}>${d}:${chosen.map((v) => v.id).join(",")}`,
          originId: o,
          destId: d,
          vehicleIds: chosen.map((v) => v.id),
          bikes: chosen.filter((v) => v.type === "bike").length,
          scooters: chosen.filter((v) => v.type === "scooter").length,
          before,
          after: { origin: pct(o), dest: pct(d) },
        });
        need -= n;
        moved = true;
        break;
      }
      if (!moved) break;
    }
  }
  return out;
}

export function applySuggestion(
  state: AppState,
  suggestionKey: string,
  now: number,
  responsible: string,
  reason: string,
): OpResult<{ suggestion: Suggestion }> {
  const fresh = planRedistribution(state).find((s) => s.key === suggestionKey);
  if (!fresh) return fail("plan_outdated");
  const dest = state.stations.find((s) => s.id === fresh.destId)!;
  if (stationStats(state, dest).free < fresh.vehicleIds.length) return fail("plan_outdated");
  for (const id of fresh.vehicleIds) {
    const v = state.vehicles.find((x) => x.id === id);
    if (!v || v.stationId !== fresh.originId || !isEligible(v, state.config)) return fail("plan_outdated");
  }
  const ids = new Set(fresh.vehicleIds);
  return {
    ok: true,
    suggestion: fresh,
    state: {
      ...state,
      vehicles: state.vehicles.map((v) => (ids.has(v.id) ? { ...v, stationId: fresh.destId } : v)),
      movements: [
        ...state.movements,
        ...fresh.vehicleIds.map((vehicleId) => ({
          id: newId("M", now),
          vehicleId,
          fromStationId: fresh.originId,
          toStationId: fresh.destId,
          at: now,
          responsible,
          reason,
        })),
      ],
    },
  };
}
