import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, Info } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";
import { useNow, useStore } from "@/lib/mobility/store";
import { allStationStats, ineligibleReason, isServiceOpen, type StationStats } from "@/lib/mobility/rules";
import type { AppState, VehicleType } from "@/lib/mobility/types";
import { CampusMap, MapLegend } from "@/components/mobility/CampusMap";
import { Card, OccupancyBar, PageHeader, Pill, VehicleIcon, occupancyLevel, levelClasses } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Estaciones — Movilidad del campus" },
      { name: "description", content: "Mapa esquemático y disponibilidad de bicicletas y scooters en las estaciones del campus de Ciudad del Saber." },
      { property: "og:title", content: "Estaciones — Movilidad del campus" },
      { property: "og:description", content: "Consulta bicicletas, scooters y plazas libres en cada estación del campus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StationsPage,
});

type Filter = "all" | VehicleType;

function StationsPage() {
  const { t } = useI18n();
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const stats = useMemo(() => (state ? allStationStats(state) : []), [state]);
  if (!state) return null;
  const sel = stats.find((s) => s.station.id === selected) ?? null;

  return (
    <>
      <PageHeader
        title={t("nav.stations")}
        subtitle={t("service.hours", { open: state.config.schedule.open, close: state.config.schedule.close })}
      />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div role="group" aria-label={t("filter.label")} className="flex gap-2">
            {(["all", "bike", "scooter"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f !== "all" && <VehicleIcon type={f} />}
                {f === "all" ? t("filter.all") : f === "bike" ? t("common.bikes") : t("common.scooters")}
              </Button>
            ))}
          </div>
          <CampusMap stats={stats} cfg={state.config} selectedId={selected} onSelect={setSelected} filter={filter} />
          <MapLegend filter={filter} cfg={state.config} />
        </div>
        <section aria-label={t("station.list")}>
          <h2 className="mb-1 text-lg font-bold">{t("station.list")}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{t("station.availableHelp")}</p>
          <ul className="space-y-3">
            {stats.map((s) => (
              <li key={s.station.id}>
                <StationCard stats={s} state={state} filter={filter} onOpen={() => setSelected(s.station.id)} />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
          {sel && <StationDetail stats={sel} state={state} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Counts({ stats, filter }: { stats: StationStats; filter: Filter }) {
  const { t } = useI18n();
  const cell = (label: string, value: number, strong?: boolean) => (
    <div className={cn("rounded-xl px-2 py-1.5", strong ? "bg-primary-soft" : "bg-muted")}>
      <div className="font-display text-xl font-extrabold tabular">{value}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <div className={cn("grid gap-2 text-center", filter === "all" ? "grid-cols-2 min-[400px]:grid-cols-4" : "grid-cols-3")}>
      {filter !== "scooter" && cell(t("station.availableBikes", { n: stats.availableBikes }), stats.availableBikes, true)}
      {filter !== "bike" && cell(t("station.eligibleScooters", { n: stats.eligibleScooters }), stats.eligibleScooters, true)}
      {cell(`${t("station.present")} (${stats.station.capacity})`, stats.occupancy)}
      {cell(t("station.free", { n: stats.free }), stats.free)}
    </div>
  );
}

function StationCard({ stats, state, filter, onOpen }: { stats: StationStats; state: AppState; filter: Filter; onOpen: () => void }) {
  const { t } = useI18n();
  const level = occupancyLevel(stats, state.config);
  return (
    <Card className="p-0">
      <button type="button" onClick={onOpen} className="block w-full rounded-2xl p-4 text-left hover:bg-accent/40">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold">
            <span className={cn("size-3 shrink-0 rounded-full", levelClasses[level].dot)} aria-hidden />
            {stats.station.name}
          </h3>
          {stats.full && (
            <Pill tone="danger">
              <Ban className="size-3.5" aria-hidden />
              {t("status.full")}
            </Pill>
          )}
        </div>
        <Counts stats={stats} filter={filter} />
        <div className="mt-3">
          <OccupancyBar stats={stats} cfg={state.config} />
        </div>
      </button>
    </Card>
  );
}

function StationDetail({ stats, state }: { stats: StationStats; state: AppState }) {
  const { t } = useI18n();
  const now = useNow(30_000);
  const open = isServiceOpen(now, state.config);
  const typeLabel = (ty: VehicleType) => (ty === "bike" ? t("common.bikes") : t("common.scooters")).toLowerCase();
  const pick = (ty: VehicleType) => {
    const reason = ineligibleReason(state, stats.station.id, ty);
    return (
      <div className="rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <VehicleIcon type={ty} className="size-5 text-primary-strong" />
            {ty === "bike"
              ? t("station.availableBikes", { n: stats.availableBikes })
              : t("station.eligibleScooters", { n: stats.eligibleScooters })}
          </span>
          <span className="font-display text-2xl font-extrabold tabular">
            {ty === "bike" ? stats.availableBikes : stats.eligibleScooters}
          </span>
        </div>
        {reason ? (
          <p className="mt-2 flex gap-1.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t(`station.reason.${reason}` as TKey, { type: typeLabel(ty), threshold: state.config.batteryThreshold })}
          </p>
        ) : (
          <Button asChild className="mt-3 w-full">
            <Link to="/checkout" search={{ station: stats.station.id, type: ty }}>
              {ty === "bike" ? t("station.pickBike") : t("station.pickScooter")}
            </Link>
          </Button>
        )}
      </div>
    );
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6 text-xl">{stats.station.name}</DialogTitle>
        <DialogDescription>
          {t("station.capacity")}: {stats.station.capacity} · {t("station.present")}: {stats.occupancy} ({t("station.presentHelp").toLowerCase()}) · {t("station.free", { n: stats.free })}: {stats.free}
        </DialogDescription>
      </DialogHeader>
      <OccupancyBar stats={stats} cfg={state.config} />
      {stats.full && (
        <p className="flex gap-2 rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive" role="note">
          <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("station.fullNotice")}
        </p>
      )}
      {!open && (
        <p className="rounded-xl bg-warning-soft p-3 text-sm font-medium text-warning" role="note">
          {t("err.outside_service_hours", { hours: t("service.hours", { open: state.config.schedule.open, close: state.config.schedule.close }) })}
        </p>
      )}
      <div className="space-y-3">
        {pick("bike")}
        {pick("scooter")}
      </div>
    </>
  );
}
