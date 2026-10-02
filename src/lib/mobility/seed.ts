import { DEFAULT_CONFIG } from "./constants";
import { latestServiceInstant, normalizeLowBattery, serviceDayAt } from "./rules";
import type { AppState, Loan, Movement, Organization, Station, User, Vehicle } from "./types";

const MIN = 60_000;

const pad = (n: number) => String(n).padStart(3, "0");

const STATIONS: Array<Station & { bikes: number; scooters: number }> = [
  { id: "st-acceso", name: "Acceso principal", capacity: 14, x: 60, y: 235, bikes: 10, scooters: 4 },
  { id: "st-oi", name: "Edificio de organizaciones internacionales", capacity: 10, x: 150, y: 160, bikes: 6, scooters: 3 },
  { id: "st-lab", name: "Laboratorios", capacity: 8, x: 255, y: 205, bikes: 5, scooters: 2 },
  { id: "st-comedor", name: "Comedor", capacity: 10, x: 205, y: 110, bikes: 7, scooters: 3 },
  { id: "st-biblio", name: "Biblioteca", capacity: 8, x: 300, y: 75, bikes: 1, scooters: 0 },
  { id: "st-conv", name: "Centro de convenciones", capacity: 10, x: 95, y: 70, bikes: 1, scooters: 0 },
  { id: "st-resid", name: "Residencias", capacity: 12, x: 345, y: 165, bikes: 5, scooters: 4 },
  { id: "st-gym", name: "Gimnasio", capacity: 6, x: 335, y: 255, bikes: 1, scooters: 2 },
];

/** Battery and status for scooters parked at stations (SCO-001..018). */
const SCOOTER_SETUP: Record<number, { battery: number; charging?: boolean }> = {
  1: { battery: 85 },
  2: { battery: 92 },
  3: { battery: 20, charging: true },
  4: { battery: 15, charging: true },
  5: { battery: 64 },
  6: { battery: 18, charging: true },
  7: { battery: 47 },
  8: { battery: 73 },
  9: { battery: 21 },
  10: { battery: 55 },
  11: { battery: 88 },
  12: { battery: 9, charging: true },
  13: { battery: 76 },
  14: { battery: 76 },
  15: { battery: 33 },
  16: { battery: 20, charging: true },
  17: { battery: 100 },
  18: { battery: 12, charging: true },
  19: { battery: 68 },
  20: { battery: 81 },
};

const MAINTENANCE_BIKES = new Set([5, 24, 33]);

const ORGS: Organization[] = [
  { id: "org-1", name: "Instituto Regional de Biodiversidad Tropical" },
  { id: "org-2", name: "Red Latinoamericana de Innovación Educativa" },
  { id: "org-3", name: "Oficina Regional de Ayuda Humanitaria" },
  { id: "org-4", name: "Laboratorio de Datos Abiertos del Istmo" },
  { id: "org-5", name: "Centro de Emprendimiento Verde" },
];

const USERS: User[] = [
  { id: "u-01", name: "Ana Lucía Pérez", orgId: "org-1", credential: "CDS-1001", active: true },
  { id: "u-02", name: "Marco Delgado", orgId: "org-2", credential: "CDS-1002", active: true },
  { id: "u-03", name: "Sofía Herrera", orgId: "org-3", credential: "CDS-1003", active: true },
  { id: "u-04", name: "Daniel Ortega", orgId: "org-4", credential: "CDS-1004", active: true },
  { id: "u-05", name: "Valentina Ríos", orgId: "org-5", credential: "CDS-1005", active: true },
  { id: "u-06", name: "Tomás Quintero", orgId: "org-1", credential: "CDS-1006", active: false },
  { id: "u-07", name: "Isabel Castillo", orgId: "org-2", credential: "CDS-1007", active: true },
  { id: "u-08", name: "Andrés Moreno", orgId: "org-3", credential: "CDS-1008", active: true },
  { id: "u-09", name: "Lucía Bermúdez", orgId: "org-4", credential: "CDS-1009", active: false },
  { id: "u-10", name: "Kenji Watanabe", orgId: "org-5", credential: "CDS-1010", active: true },
];

export function createSeedState(now: number): AppState {
  const config = structuredClone(DEFAULT_CONFIG);
  const vehicles: Vehicle[] = [];
  let b = 1;
  let s = 1;
  for (const st of STATIONS) {
    for (let i = 0; i < st.bikes; i++, b++) {
      vehicles.push({
        id: `v-bic-${pad(b)}`,
        code: `BIC-${pad(b)}`,
        type: "bike",
        status: MAINTENANCE_BIKES.has(b) ? "maintenance" : "available",
        stationId: st.id,
      });
    }
    for (let i = 0; i < st.scooters; i++, s++) {
      const setup = SCOOTER_SETUP[s];
      vehicles.push({
        id: `v-sco-${pad(s)}`,
        code: `SCO-${pad(s)}`,
        type: "scooter",
        status: setup.charging ? "charging" : "available",
        stationId: st.id,
        battery: setup.battery,
      });
    }
  }
  // Remaining vehicles are out on active loans (not at any station).
  for (; b <= 40; b++)
    vehicles.push({ id: `v-bic-${pad(b)}`, code: `BIC-${pad(b)}`, type: "bike", status: "loaned", stationId: null });
  for (; s <= 20; s++)
    vehicles.push({
      id: `v-sco-${pad(s)}`,
      code: `SCO-${pad(s)}`,
      type: "scooter",
      status: "loaned",
      stationId: null,
      battery: SCOOTER_SETUP[s].battery,
    });

  const max = config.maxLoanMinutes * MIN;
  const sched = config.schedule;
  // Every seeded pickup happens inside the REAL service hours (America/Panama).
  // Active loans are anchored to the latest open minute <= now; if that is long
  // ago (night, weekend) they honestly show as overdue.
  const anchor = latestServiceInstant(now, sched);
  const active = (id: string, userId: string, vehicleId: string, origin: string, agoMin: number): Loan => {
    const startAt = latestServiceInstant(anchor - agoMin * MIN, sched);
    return { id, userId, vehicleId, originStationId: origin, startAt, dueAt: startAt + max, status: "active" };
  };
  const returned = (
    id: string,
    userId: string,
    vehicleId: string,
    origin: string,
    dest: string,
    serviceDaysBack: number,
    at: string,
    durMin: number,
  ): Loan => {
    const startAt = serviceDayAt(now, serviceDaysBack, at, sched);
    const returnedAt = startAt + durMin * MIN;
    const durationMs = returnedAt - startAt;
    return {
      id,
      userId,
      vehicleId,
      originStationId: origin,
      startAt,
      dueAt: startAt + max,
      status: "returned",
      returnStationId: dest,
      returnedAt,
      durationMs,
      overdue: durationMs > max,
    };
  };

  const loans: Loan[] = [
    active("L-0001", "u-01", "v-bic-037", "st-acceso", 25),
    active("L-0002", "u-02", "v-bic-038", "st-comedor", 155),
    active("L-0003", "u-03", "v-sco-019", "st-oi", 50),
    active("L-0004", "u-04", "v-bic-039", "st-resid", 70),
    active("L-0005", "u-05", "v-sco-020", "st-lab", 15),
    active("L-0006", "u-06", "v-bic-040", "st-gym", 90),
    returned("L-0901", "u-07", "v-bic-012", "st-acceso", "st-oi", 1, "08:10", 18),
    returned("L-0902", "u-08", "v-sco-011", "st-resid", "st-comedor", 1, "12:35", 32),
    returned("L-0903", "u-01", "v-bic-002", "st-oi", "st-acceso", 2, "09:20", 145),
    returned("L-0904", "u-10", "v-bic-031", "st-lab", "st-resid", 2, "16:05", 41),
    returned("L-0905", "u-02", "v-sco-002", "st-comedor", "st-acceso", 3, "11:00", 120),
    returned("L-0906", "u-03", "v-bic-017", "st-biblio", "st-lab", 3, "14:40", 27),
    returned("L-0907", "u-07", "v-sco-013", "st-gym", "st-resid", 4, "17:30", 188),
    returned("L-0908", "u-04", "v-bic-022", "st-conv", "st-comedor", 5, "07:45", 12),
  ];

  const movements: Movement[] = [
    {
      id: "M-0001",
      vehicleId: "v-bic-029",
      fromStationId: "st-acceso",
      toStationId: "st-biblio",
      at: serviceDayAt(now, 2, "10:30", sched),
      responsible: "Equipo de operaciones",
      reason: "Redistribución de prueba",
    },
  ];

  return normalizeLowBattery({
    version: 2,
    initializedAt: now,
    organizations: structuredClone(ORGS),
    users: structuredClone(USERS),
    stations: STATIONS.map(({ bikes: _b, scooters: _s, ...st }) => ({ ...st })),
    vehicles,
    loans,
    movements,
    config,
  });
}
