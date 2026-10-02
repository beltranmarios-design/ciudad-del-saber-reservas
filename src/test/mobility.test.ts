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
import { commitOperation, loadState, migrateState, saveState, type StorageLike } from "@/lib/mobility/storage";
import { loanIsOverdue, normalizeLowBattery, updateConfig } from "@/lib/mobility/rules";
import { translate } from "@/lib/i18n";
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
    const s20 = { ...s.vehicles.find((v) => v.code === "SCO-003")!, status: "available" as const }; // exactly 20
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

describe("review fixes", () => {
  it("battery 19/20/21: only >20 is eligible; returns at <=20 go to charging", () => {
    const s = seed();
    const base = s.vehicles.find((v) => v.code === "SCO-001")!;
    for (const [b, ok] of [[19, false], [20, false], [21, true]] as const)
      expect(isEligible({ ...base, battery: b }, s.config)).toBe(ok);
    for (const [b, status] of [[19, "charging"], [20, "charging"], [21, "available"]] as const) {
      const r = returnVehicle(s, { loanId: "L-0003", stationId: "st-gym", battery: b, now: OPEN_NOW });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const v = r.state.vehicles.find((x) => x.id === "v-sco-019")!;
      expect(v.status).toBe(status);
      expect(st(r.state, "st-gym").eligibleScooters).toBe(st(s, "st-gym").eligibleScooters + (status === "available" ? 1 : 0));
    }
  });

  it("seed has no parked 'available' scooter at <=20 % (SCO-003, SCO-016 charging)", () => {
    const s = seed();
    for (const v of s.vehicles)
      if (v.type === "scooter" && v.status === "available") expect(v.battery!).toBeGreaterThan(20);
    expect(s.vehicles.find((v) => v.code === "SCO-003")!.status).toBe("charging");
    expect(s.vehicles.find((v) => v.code === "SCO-016")!.status).toBe("charging");
    expect(s.vehicles.find((v) => v.code === "SCO-009")!.status).toBe("available"); // 21 %
  });

  it("v1 -> v2 migration fixes low-battery scooters without losing loans or history", () => {
    const s = seed();
    const v1 = {
      ...s,
      version: 1,
      vehicles: s.vehicles.map((v) =>
        v.code === "SCO-003" || v.code === "SCO-016" ? { ...v, status: "available" as const } : v.code === "SCO-007" ? { ...v, status: "maintenance" as const, battery: 5 } : v,
      ),
    } as unknown as AppState;
    const mem = memStorage();
    mem.setItem(STORAGE_KEY, JSON.stringify(v1));
    const r = loadState(mem, OPEN_NOW);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.state.version).toBe(2);
    expect(r.state.vehicles.find((v) => v.code === "SCO-003")!.status).toBe("charging");
    expect(r.state.vehicles.find((v) => v.code === "SCO-007")!.status).toBe("maintenance");
    expect(r.state.loans).toEqual(v1.loans);
    expect(r.state.movements).toEqual(v1.movements);
    expect(r.state.vehicles.map((v) => v.stationId)).toEqual(v1.vehicles.map((v) => v.stationId));
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(2); // persisted
    expect(migrateState(r.state).migrated).toBe(false);
  });

  it("raising the battery threshold re-normalises parked scooters", () => {
    const s = seed();
    const r = updateConfig(s, { ...s.config, batteryThreshold: 50 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const v of r.state.vehicles)
      if (v.type === "scooter" && v.status === "available") expect(v.battery!).toBeGreaterThan(50);
    expect(normalizeLowBattery(r.state)).toBe(r.state);
  });

  it("seeded pickups always fall inside real service hours, with coherent dates", () => {
    const real = { ...seed().config, scheduleOverride: "auto" as const };
    const samples = [
      Date.UTC(2026, 9, 2, 10, 42), // Fri 05:42 PTY (before opening)
      Date.UTC(2026, 9, 2, 12, 10), // Fri 07:10 PTY
      OPEN_NOW,
      Date.UTC(2026, 9, 3, 2, 0), // Fri 21:00 PTY
      Date.UTC(2026, 9, 4, 18, 0), // Sunday
      Date.UTC(2026, 9, 5, 13, 0), // Mon 08:00 PTY
    ];
    for (const now of samples) {
      const s = createSeedState(now);
      for (const l of s.loans) {
        expect(isServiceOpen(l.startAt, real)).toBe(true);
        expect(l.startAt).toBeLessThanOrEqual(now);
        expect(l.dueAt).toBe(l.startAt + 120 * MIN);
        if (l.status === "returned") {
          expect(l.returnedAt!).toBeLessThanOrEqual(now);
          expect(l.durationMs).toBe(l.returnedAt! - l.startAt);
          expect(l.overdue).toBe(l.durationMs! > 120 * MIN);
        }
      }
      const actives = s.loans.filter((l) => l.status === "active");
      expect(actives).toHaveLength(6);
      // Before opening, every active loan started on a previous service day and is overdue.
      if (now === samples[0]) for (const l of actives) expect(loanIsOverdue(l, now, s.config)).toBe(true);
    }
  });

  it("availability, occupancy and free docks stay consistent", () => {
    const s = seed();
    for (const x of allStationStats(s)) {
      expect(x.free).toBe(x.station.capacity - x.occupancy);
      expect(x.availableBikes + x.eligibleScooters).toBeLessThanOrEqual(x.occupancy);
      expect(x.availableBikes + x.eligibleScooters).toBe(x.present.filter((v) => isEligible(v, s.config)).length);
    }
  });

  it("plurals and specific errors in both languages", () => {
    expect(translate("es", "return.freeSpaces", { n: 1 })).toBe("1 plaza libre");
    expect(translate("es", "return.freeSpaces", { n: 2 })).toBe("2 plazas libres");
    expect(translate("en", "return.freeSpaces", { n: 1 })).toBe("1 free dock");
    expect(translate("es", "station.availableBikes", { n: 1 })).toBe("Bicicleta disponible");
    expect(translate("es", "station.availableBikes", { n: 0 })).toBe("Bicicletas disponibles");
    expect(translate("es", "fleet.results", { n: 1 })).toBe("1 vehículo");
    expect(translate("en", "fleet.results", { n: 3 })).toBe("3 vehicles");
    expect(translate("es", "redis.confirmBody", { n: 1, from: "A", to: "B" })).toBe("Se moverá 1 vehículo de A a B.");
    expect(translate("es", "settings.err.highOccupancy")).toContain("El umbral alto de ocupación debe ser mayor que el umbral bajo");
    expect(translate("en", "settings.err.highOccupancy")).toContain("greater than the low threshold");
    expect(translate("es", "service.demoBanner.open")).toBe("Modo demostración: servicio forzado abierto");
    expect(translate("es", "service.demoBanner.closed")).toBe("Modo demostración: servicio forzado cerrado");
  });
});
