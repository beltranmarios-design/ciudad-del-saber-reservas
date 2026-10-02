import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import { allStationStats, setCapacity, type StationStats } from "@/lib/mobility/rules";
import type { AppState } from "@/lib/mobility/types";
import { BatteryValue, Card, FieldError, OccupancyBar, PageHeader, Pill, StatusPill, VehicleIcon, inputCls, useErrorText } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ops/stations")({
  head: () => ({
    meta: [
      { title: "Estaciones (operaciones) — Movilidad del campus" },
      { name: "description", content: "Capacidad, ocupación y vehículos presentes en cada estación." },
      { property: "og:title", content: "Estaciones (operaciones) — Movilidad del campus" },
      { property: "og:description", content: "Gestión de capacidad y vehículos por estación." },
    ],
  }),
  component: OpsStations,
});

function OpsStations() {
  const { t } = useI18n();
  const { state } = useStore();
  if (!state) return null;
  return (
    <>
      <PageHeader title={t("nav.stations")} />
      <div className="grid gap-4 lg:grid-cols-2">
        {allStationStats(state).map((s) => (
          <StationPanel key={s.station.id} stats={s} state={state} />
        ))}
      </div>
    </>
  );
}

function StationPanel({ stats, state }: { stats: StationStats; state: AppState }) {
  const { t } = useI18n();
  const { run } = useStore();
  const errText = useErrorText();
  const [cap, setCap] = useState(String(stats.station.capacity));
  const [err, setErr] = useState<string | null>(null);
  const id = `cap-${stats.station.id}`;
  const save = () => {
    const n = Number(cap);
    const res = run((s) => setCapacity(s, stats.station.id, n));
    if (res.ok) {
      setErr(null);
      toast.success(t("opsStations.capacitySaved"));
    } else setErr(errText(res.error, res.params));
  };
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold">{stats.station.name}</h2>
        {stats.full && <Pill tone="danger">{t("status.full")}</Pill>}
      </div>
      <dl className="my-3 grid grid-cols-4 gap-2 text-center text-xs">
        {[
          [t("station.capacity"), stats.station.capacity],
          [t("station.present"), stats.occupancy],
          [t("station.free", { n: stats.free }), stats.free],
          [`${t("common.bikes")} / ${t("common.scooters")}`, `${stats.availableBikes} / ${stats.eligibleScooters}`],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl bg-muted p-2">
            <dd className="font-display text-lg font-extrabold tabular">{v}</dd>
            <dt className="text-muted-foreground">{l}</dt>
          </div>
        ))}
      </dl>
      <OccupancyBar stats={stats} cfg={state.config} />
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex-1">
          <label htmlFor={id} className="mb-1 block text-sm font-semibold">
            {t("opsStations.editCapacity")}
          </label>
          <input id={id} inputMode="numeric" className={inputCls} value={cap} aria-invalid={!!err} onChange={(e) => setCap(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">
          {t("common.save")}
        </Button>
      </form>
      <FieldError>{err}</FieldError>
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-info">
          {t("opsStations.vehicles")} ({stats.present.length})
        </summary>
        <ul className="divide-y text-sm">
          {stats.present
            .slice()
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((v) => (
              <li key={v.id} className="flex items-center gap-2 py-2">
                <VehicleIcon type={v.type} className="size-4 text-muted-foreground" />
                <span className="font-semibold">{v.code}</span>
                <span className="ml-auto flex items-center gap-2">
                  <BatteryValue value={v.battery} threshold={state.config.batteryThreshold} />
                  <StatusPill status={v.status} />
                </span>
              </li>
            ))}
        </ul>
      </details>
    </Card>
  );
}
