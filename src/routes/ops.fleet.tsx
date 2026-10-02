import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import { setBattery, setVehicleStatus } from "@/lib/mobility/rules";
import type { AppState, OpResult, Vehicle, VehicleStatus } from "@/lib/mobility/types";
import { BatteryValue, Card, EmptyState, FieldError, PageHeader, Select, StatusPill, VehicleIcon, inputCls, useErrorText } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ops/fleet")({
  head: () => ({
    meta: [
      { title: "Flota — Movilidad del campus" },
      { name: "description", content: "Búsqueda y gestión de bicicletas y scooters: estado, mantenimiento y batería." },
      { property: "og:title", content: "Flota — Movilidad del campus" },
      { property: "og:description", content: "Gestión de la flota de bicicletas y scooters del campus." },
    ],
  }),
  component: Fleet,
});

function Fleet() {
  const { t } = useI18n();
  const { state } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [station, setStation] = useState("all");
  if (!state) return null;
  const list = state.vehicles
    .filter((v) => !q || v.code.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((v) => type === "all" || v.type === type)
    .filter((v) => status === "all" || v.status === status)
    .filter((v) => station === "all" || (station === "none" ? v.stationId === null : v.stationId === station));

  return (
    <>
      <PageHeader title={t("nav.fleet")} subtitle={t("fleet.results", { n: list.length })} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-semibold">{t("common.search")}</label>
          <input id="q" className={inputCls} value={q} placeholder={t("fleet.searchPlaceholder")} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select id="ft" label={t("common.type")} value={type} onChange={setType}>
          <option value="all">{t("common.all")}</option>
          <option value="bike">{t("common.bikes")}</option>
          <option value="scooter">{t("common.scooters")}</option>
        </Select>
        <Select id="fs" label={t("common.status")} value={status} onChange={setStatus}>
          <option value="all">{t("common.all")}</option>
          {(["available", "loaned", "maintenance", "charging"] as const).map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </Select>
        <Select id="fst" label={t("common.station")} value={station} onChange={setStation}>
          <option value="all">{t("common.all")}</option>
          {state.stations.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="none">{t("fleet.noStation")}</option>
        </Select>
      </div>
      {list.length === 0 ? (
        <EmptyState title={t("fleet.empty")} action={<Button variant="outline" onClick={() => { setQ(""); setType("all"); setStatus("all"); setStation("all"); }}>{t("common.all")}</Button>} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <li key={v.id}>
              <VehicleCard v={v} state={state} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function VehicleCard({ v, state }: { v: Vehicle; state: AppState }) {
  const { t } = useI18n();
  const { run } = useStore();
  const errText = useErrorText();
  const [err, setErr] = useState<string | null>(null);
  const [bat, setBat] = useState(v.battery !== undefined ? String(v.battery) : "");
  const stationName = state.stations.find((s) => s.id === v.stationId)?.name ?? t("fleet.noStation");
  const apply = (op: (s: AppState) => OpResult) => {
    const r = run(op);
    if (r.ok) {
      setErr(null);
      toast.success(t("fleet.updated"));
    } else setErr(errText(r.error, r.params));
  };
  const setS = (s: Exclude<VehicleStatus, "loaned">) => apply((st) => setVehicleStatus(st, v.id, s));
  const loaned = v.status === "loaned";
  return (
    <Card>
      <div className="flex items-center gap-2">
        <VehicleIcon type={v.type} className="size-5 text-primary-strong" />
        <span className="font-display text-lg font-extrabold">{v.code}</span>
        <span className="ml-auto"><StatusPill status={v.status} /></span>
      </div>
      <div className="mt-1 flex justify-between text-sm text-muted-foreground">
        <span>{stationName}</span>
        <BatteryValue value={v.battery} threshold={state.config.batteryThreshold} />
      </div>
      {loaned ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("fleet.loanedNote")}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {v.status !== "maintenance" && <Button size="sm" variant="outline" onClick={() => setS("maintenance")}>{t("fleet.toMaintenance")}</Button>}
            {v.status !== "available" && <Button size="sm" variant="outline" onClick={() => setS("available")}>{t("fleet.toAvailable")}</Button>}
            {v.type === "scooter" && v.status !== "charging" && <Button size="sm" variant="outline" onClick={() => setS("charging")}>{t("fleet.toCharging")}</Button>}
            {v.type === "scooter" && (
              <Button size="sm" variant="secondary" onClick={() => { setBat("100"); apply((s) => setBattery(s, v.id, 100)); }}>
                {t("fleet.chargeFull")}
              </Button>
            )}
          </div>
          {v.type === "scooter" && (
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = bat.trim() === "" ? NaN : Number(bat); apply((s) => setBattery(s, v.id, n)); }}>
              <div className="flex-1">
                <label htmlFor={`b-${v.id}`} className="mb-1 block text-xs font-semibold">{t("fleet.editBattery")} (%)</label>
                <input id={`b-${v.id}`} inputMode="numeric" className={inputCls} value={bat} onChange={(e) => setBat(e.target.value)} aria-invalid={!!err} />
              </div>
              <Button type="submit" size="sm" variant="outline">{t("common.save")}</Button>
            </form>
          )}
        </div>
      )}
      <FieldError>{err}</FieldError>
    </Card>
  );
}
