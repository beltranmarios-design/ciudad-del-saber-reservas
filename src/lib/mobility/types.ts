// Domain model for campus mobility. Pure data types — no persistence concerns.

export type VehicleType = "bike" | "scooter";
export type VehicleStatus = "available" | "loaned" | "maintenance" | "charging";
export type LoanStatus = "active" | "returned";

export interface Organization {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  orgId: string;
  credential: string;
  active: boolean;
}

export interface Station {
  id: string;
  name: string;
  capacity: number;
  /** Position on the schematic map (viewBox 0..400 x 0..300). Illustrative only. */
  x: number;
  y: number;
}

export interface Vehicle {
  id: string;
  code: string;
  type: VehicleType;
  status: VehicleStatus;
  /** null when loaned: a loaned vehicle is not physically at any station. */
  stationId: string | null;
  /** 0..100, scooters only. */
  battery?: number | undefined;
}

export interface Loan {
  id: string;
  userId: string;
  vehicleId: string;
  originStationId: string;
  startAt: number;
  dueAt: number;
  status: LoanStatus;
  returnStationId?: string;
  returnedAt?: number;
  durationMs?: number;
  overdue?: boolean;
}

export interface Movement {
  id: string;
  vehicleId: string;
  fromStationId: string;
  toStationId: string;
  at: number;
  responsible: string;
  reason: string;
}

export interface ServiceSchedule {
  /** 0 = Sunday ... 6 = Saturday */
  days: number[];
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  timeZone: string;
}

export type ScheduleOverride = "auto" | "open" | "closed";

export interface Config {
  maxLoanMinutes: number;
  batteryThreshold: number;
  highOccupancy: number;
  lowOccupancy: number;
  schedule: ServiceSchedule;
  /** Demo clock for testing schedule. Only editable from operations. */
  scheduleOverride: ScheduleOverride;
}

export interface AppState {
  version: 2;
  initializedAt: number;
  organizations: Organization[];
  users: User[];
  stations: Station[];
  vehicles: Vehicle[];
  loans: Loan[];
  movements: Movement[];
  config: Config;
}

export type ErrorCode =
  | "credential_not_found"
  | "user_inactive"
  | "user_has_active_loan"
  | "outside_service_hours"
  | "no_eligible_vehicle"
  | "station_not_found"
  | "station_full"
  | "loan_not_found"
  | "loan_not_active"
  | "invalid_battery"
  | "vehicle_not_found"
  | "vehicle_loaned"
  | "battery_too_low"
  | "not_a_scooter"
  | "invalid_capacity"
  | "capacity_below_occupancy"
  | "invalid_name"
  | "duplicate_credential"
  | "invalid_credential"
  | "org_not_found"
  | "invalid_config"
  | "plan_outdated"
  | "save_failed"
  | "storage_unavailable"
  | "storage_corrupt";

export type OpResult<T = object> =
  | ({ ok: true; state: AppState } & T)
  | { ok: false; error: ErrorCode; params?: Record<string, string | number> };
