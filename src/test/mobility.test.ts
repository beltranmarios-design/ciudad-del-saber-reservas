import { describe, expect, it } from "vitest";
import { createSeedState } from "@/lib/mobility/seed";
import {
  allStationStats,
  applySuggestion,
  checkout,
  isEligible,
  isServiceOpen,
  pickVehicle,
  planRedistribution,
  returnVehicle,
  setVehicleStatus,
  stationStats,
} from "@/lib/mobility/rules";
import { commitOperation, loadState, saveState, type StorageLike } from "@/lib/mobility/storage";
import { STORAGE_KEY } from "@/lib/mobility/constants";
import type { AppState } from "@/lib/mobility/types";

// Friday 2026-10-02 10:00 in Panama (UTC-5) = 15:00 UTC
const OPEN_NOW = Date.UTC(2026, 9, 2, 15, 0);
const MIN = 60_000;

const seed = () => createSeedState(OPEN_NOW);
const st = (s: AppState, id: string) => stationStats(s, s.stations.find((x) => x.id === id)!);

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function countFleet(s: AppState) {
  return {
    bikes: s.vehicles.filter((v) => v.type === "bike").length,
    scooters: s.vehicles.filter((v) => v.type === "scooter").length,
  };
}

describe("seed data", () => {
  it("matches the briefing", () => {
    const s = seed();
    expect(s.stations).toHaveLength(8);
    expect(countFleet(s)).toEqual({ bikes: 40, scooters: 20 });
    expect(s.loans.filter((l) => l.status === "active")).toHaveLength(6);
    expect(st(s, "st-acceso").full).toBe(true);
    expect(st(s, "st-comedor").full).toBe(true);
    expect(st(s, "st-biblio").pct).toBeLessThan(20);
    expect(st(s, "st-conv").pct).toBeLessThan(20);
  });
});

describe("acceptance", () => {
  it("1. a user cannot have two active loans", () => {
    const s = seed();
    const r = checkout(s, { credential: "CDS-1001", stationId: "st-oi", type: "bike", now: OPEN_NOW });
    expect(r).toMatchObject({ ok: false, error: "user_has_active_loan" });
    const ok = checkout(s, { credential: "CDS-1007", stationId: "st-oi", type: "bike", now: OPEN_NOW });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const again = checkout(ok.state, { credential: "CDS-1007", stationId: "st-oi", type: "bike", now: OPEN_NOW });
    expect(again).toMatchObject({ ok: false, error: "user_has_active_loan" });
  });

  it("2. returning to a full station fails without changing loan or vehicle", () => {
    const s = seed();
    const r = returnVehicle(s, { loanId: "L-0001", stationId: "st-acceso", now: OPEN_NOW });
    expect(r).toMatchObject({ ok: false, error: "station_full" });
    expect(s.loans.find((l) => l.id === "L-0001")!.status).toBe("active");
    expect(s.vehicles.find((v) => v.id === "v-bic-037")).toMatchObject({ status: "loaned", stationId: null });
  });

  it("3. returning to another station with space succeeds", () => {
    const s = seed();
    const r = returnVehicle(s, { loanId: "L-0001", stationId: "st-biblio", now: OPEN_NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.loan).toMatchObject({ status: "returned", returnStationId: "st-biblio", returnedAt: OPEN_NOW });
    expect(r.state.vehicles.find((v) => v.id === "v-bic-037")).toMatchObject({ status: "available", stationId: "st-biblio" });
  });

  it("4. assigns the scooter with the highest battery (ties by code)", () => {
    const s = seed();
    expect(pickVehicle(s, "st-acceso", "scooter")!.code).toBe("SCO-002"); // 92 > 85
    expect(pickVehicle(s, "st-resid", "scooter")!.code).toBe("SCO-013"); // 76 tie with SCO-014
  });

  it("5. scooters with battery <= 20% are never assigned", () => {
    const s = seed();
    const s20 = s.vehicles.find((v) => v.code === "SCO-003")!; // exactly 20, available
    expect(isEligible(s20, s.config)).toBe(false);
    // Leave only low-battery scooters at Acceso
    const only = { ...s, vehicles: s.vehicles.map((v) => (v.code === "SCO-001" || v.code === "SCO-002" ? { ...v, battery: 10 } : v)) };
    expect(pickVehicle(only, "st-acceso", "scooter")).toBeUndefined();
    const r = checkout(only, { credential: "CDS-1007", stationId: "st-acceso", type: "scooter", now: OPEN_NOW });
    expect(r).toMatchObject({ ok: false, error: "no_eligible_vehicle" });
  });

  it("6. a vehicle in maintenance is not available", () => {
    const s = seed();
    const bike = s.vehicles.find((v) => v.code === "BIC-005")!;
    expect(bike.status).toBe("maintenance");
    expect(isEligible(bike, s.config)).toBe(false);
    const r = setVehicleStatus(s, "v-bic-001", "maintenance");
    expect(r.ok).toBe(true);
    if (r.ok) expect(st(r.state, "st-acceso").availableBikes).toBe(st(s, "st-acceso").availableBikes - 1);
  });

  it("7 & 8. loans over 2h are overdue, and the flag is kept in history", () => {
    const s = seed();
    const exact = returnVehicle(s, { loanId: "L-0001", stationId: "st-biblio", now: s.loans[0].startAt + 120 * MIN });
    expect(exact.ok && exact.loan.overdue).toBe(false);
    const over = returnVehicle(s, { loanId: "L-0001", stationId: "st-biblio", now: s.loans[0].startAt + 120 * MIN + 1 });
    expect(over.ok && over.loan.overdue).toBe(true);
    if (!over.ok) return;
    expect(over.state.loans.find((l) => l.id === "L-0001")!.overdue).toBe(true);
    expect(s.loans.filter((l) => l.status === "returned" && l.overdue).length).toBeGreaterThan(0);
  });

  it("9. redistribution goes from >80% stations to <20% stations, lowest first", () => {
    const s = seed();
    const plan = planRedistribution(s);
    expect(plan.length).toBeGreaterThan(0);
    for (const p of plan) {
      expect(st(s, p.originId).pct).toBeGreaterThan(80);
      expect(st(s, p.destId).pct).toBeLessThan(20);
    }
    expect(plan[0].destId).toBe("st-conv"); // 10% < 12.5%
  });

  it("10. exactly 80% is not an origin and exactly 20% is not a destination", () => {
    const base = seed();
    // Build: one station at exactly 80% (8/10), one at exactly 20% (2/10), others at 50%.
    const s: AppState = {
      ...base,
      stations: [
        { id: "a", name: "A", capacity: 10, x: 0, y: 0 },
        { id: "b", name: "B", capacity: 10, x: 0, y: 0 },
      ],
      vehicles: Array.from({ length: 10 }, (_, i) => ({
        id: `v${i}`,
        code: `BIC-${100 + i}`,
        type: "bike" as const,
        status: "available" as const,
        stationId: i < 8 ? "a" : "b",
      })),
      loans: [],
    };
    expect(planRedistribution(s)).toEqual([]);
    // 9/10 = 90% origin and 1/10 = 10% destination → plan exists
    const s2 = { ...s, vehicles: s.vehicles.map((v, i) => ({ ...v, stationId: i < 9 ? "a" : "b" })) };
    expect(planRedistribution(s2).length).toBe(1);
  });

  it("11. redistribution respects capacity and never repeats vehicles", () => {
    const s = seed();
    const plan = planRedistribution(s);
    const ids = plan.flatMap((p) => p.vehicleIds);
    expect(new Set(ids).size).toBe(ids.length);
    let cur = s;
    for (const p of plan) {
      const r = applySuggestion(cur, p.key, OPEN_NOW, "test", "test");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      cur = r.state;
    }
    for (const x of allStationStats(cur)) expect(x.occupancy).toBeLessThanOrEqual(x.station.capacity);
    expect(countFleet(cur)).toEqual({ bikes: 40, scooters: 20 });
    // No vehicles moved should have been unavailable
    for (const id of ids) expect(isEligible(s.vehicles.find((v) => v.id === id)!, s.config)).toBe(true);
  });

  it("12. checkout and return update free spaces", () => {
    const s = seed();
    const before = st(s, "st-oi").free;
    const c = checkout(s, { credential: "CDS-1007", stationId: "st-oi", type: "bike", now: OPEN_NOW });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(st(c.state, "st-oi").free).toBe(before + 1);
    const r = returnVehicle(c.state, { loanId: c.loan.id, stationId: "st-gym", now: OPEN_NOW + 10 * MIN });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(st(r.state, "st-gym").free).toBe(st(s, "st-gym").free - 1);
  });

  it("13. changes persist across reloads", () => {
    const mem = memStorage();
    const first = loadState(mem, OPEN_NOW);
    expect(first.status === "ok" && first.seeded).toBe(true);
    const res = commitOperation(mem, (s) =>
      checkout(s, { credential: "CDS-1007", stationId: "st-oi", type: "bike", now: OPEN_NOW }),
    );
    expect(res.ok).toBe(true);
    const reloaded = loadState(mem, OPEN_NOW + 1000);
    expect(reloaded.status).toBe("ok");
    if (reloaded.status !== "ok") return;
    expect(reloaded.seeded).toBe(false);
    expect(reloaded.state.loans.filter((l) => l.status === "active")).toHaveLength(7);
  });

  it("14. fleet always keeps exactly 40 bikes and 20 scooters", () => {
    let s = seed();
    const c = checkout(s, { credential: "CDS-1007", stationId: "st-oi", type: "scooter", now: OPEN_NOW });
    if (c.ok) s = c.state;
    const r = returnVehicle(s, { loanId: "L-0003", stationId: "st-gym", battery: 10, now: OPEN_NOW });
    if (r.ok) s = r.state;
    expect(countFleet(s)).toEqual({ bikes: 40, scooters: 20 });
    expect(s.vehicles).toHaveLength(60);
  });

  it("15. service hours are computed in America/Panama", () => {
    const cfg = seed().config;
    expect(isServiceOpen(Date.UTC(2026, 9, 2, 11, 59), cfg)).toBe(false); // Fri 06:59 PTY
    expect(isServiceOpen(Date.UTC(2026, 9, 2, 12, 0), cfg)).toBe(true); // Fri 07:00 PTY
    expect(isServiceOpen(Date.UTC(2026, 9, 3, 0, 59), cfg)).toBe(true); // Fri 19:59 PTY (Sat UTC)
    expect(isServiceOpen(Date.UTC(2026, 9, 3, 1, 0), cfg)).toBe(false); // Fri 20:00 PTY
    expect(isServiceOpen(Date.UTC(2026, 9, 3, 15, 0), cfg)).toBe(false); // Saturday
    const r = checkout(seed(), { credential: "CDS-1007", stationId: "st-oi", type: "bike", now: Date.UTC(2026, 9, 3, 15, 0) });
    expect(r).toMatchObject({ ok: false, error: "outside_service_hours" });
  });

  it("16. a persistence failure does not produce a false confirmation", () => {
    const mem = memStorage();
    loadState(mem, OPEN_NOW);
    const snapshot = mem.data.get(STORAGE_KEY);
    const failing: StorageLike = {
      ...mem,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    const res = commitOperation(failing, (s) =>
      checkout(s, { credential: "CDS-1007", stationId: "st-oi", type: "bike", now: OPEN_NOW }),
    );
    expect(res).toMatchObject({ ok: false, error: "save_failed" });
    expect(mem.data.get(STORAGE_KEY)).toBe(snapshot);
    expect(saveState(failing, seed()).ok).toBe(false);
  });

  it("corrupt JSON is reported, not overwritten", () => {
    const mem = memStorage();
    mem.setItem(STORAGE_KEY, "{not json");
    expect(loadState(mem).status).toBe("corrupt");
    expect(mem.getItem(STORAGE_KEY)).toBe("{not json");
  });
});
