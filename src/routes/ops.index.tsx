import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";
import { useNow, useStore } from "@/lib/mobility/store";
import { allStationStats, loanIsOverdue, planRedistribution } from "@/lib/mobility/rules";
import { Card, PageHeader, StatusPill } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";
import type { VehicleStatus } from "@/lib/mobility/types";

export const Route = createFileRoute("/ops/")({
  head: () => ({
    meta: [
      { title: "Resumen de operaciones — Movilidad del campus" },
      { name: "description", content: "Estado de la flota, préstamos y estaciones del campus." },
      { property: "og:title", content: "Resumen de operaciones — Movilidad del campus" },
      { property: "og:description", content: "Indicadores operativos de movilidad del campus." },
    ],
  }),
  component: Summary,
});

function Summary() {
  const { t, fmtPct } = useI18n();
  const { state } = useStore();
  const now = useNow(15_000);
  if (!state) return null;
  const cfg = state.config;
  const stats = allStationStats(state);
  const active = state.loans.filter((l) => l.status === "active");
  const overdue = active.filter((l) => loanIsOverdue(l, now, cfg));
  const byStatus = (["available", "loaned", "maintenance", "charging"] as VehicleStatus[]).map((s) => ({
    s,
    bikes: state.vehicles.filter((v) => v.status === s && v.type === "bike").length,
    scooters: state.vehicles.filter((v) => v.status === s && v.type === "scooter").length,
  }));
  const needCharge = state.vehicles.filter((v) => v.type === "scooter" && v.status !== "loaned" && (v.battery ?? 0) <= cfg.batteryThreshold);
  const full = stats.filter((s) => s.full);
  const high = stats.filter((s) => s.pct > cfg.highOccupancy);
  const low = stats.filter((s) => s.pct < cfg.lowOccupancy);
  const plan = planRedistribution(state);

  const list = (items: typeof stats) =>
    items.length ? (
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((s) => (
          <li key={s.station.id} className="flex justify-between gap-2">
            <span>{s.station.name}</span>
            <span className="tabular font-semibold">{fmtPct(s.pct)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-2 text-sm text-muted-foreground">{t("summary.noneStations")}</p>
    );

  return (
    <>
      <PageHeader title={t("nav.summary")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("summary.fleet")} value={state.vehicles.length} sub={`${state.vehicles.filter((v) => v.type === "bike").length} ${t("common.bikes").toLowerCase()} · ${state.vehicles.filter((v) => v.type === "scooter").length} ${t("common.scooters").toLowerCase()}`} />
        <Kpi label={t("summary.activeLoans")} value={active.length} />
        <Kpi label={t("summary.overdueLoans")} value={overdue.length} danger={overdue.length > 0} />
        <Kpi label={t("summary.needCharge")} value={needCharge.length} danger={needCharge.length > 0} sub={needCharge.map((v) => `${v.code} (${v.battery} %)`).join(", ")} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">{t("summary.byStatus")}</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">{t("common.status")}</th>
                <th className="py-1 text-right font-medium">{t("common.bikes")}</th>
                <th className="py-1 text-right font-medium">{t("common.scooters")}</th>
              </tr>
            </thead>
            <tbody>
              {byStatus.map((r) => (
                <tr key={r.s} className="border-t">
                  <td className="py-2"><StatusPill status={r.s} /></td>
                  <td className="py-2 text-right tabular font-semibold">{r.bikes}</td>
                  <td className="py-2 text-right tabular font-semibold">{r.scooters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="font-bold">{t("nav.redistribution")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("redis.rule", { high: cfg.highOccupancy, low: cfg.lowOccupancy })}</p>
          <p className="mt-3 font-display text-3xl font-extrabold">{plan.reduce((n, p) => n + p.vehicleIds.length, 0)}</p>
          <Button asChild className="mt-3">
            <Link to="/ops/redistribution">
              {t("summary.goRedistribution")} <ArrowRight />
            </Link>
          </Button>
        </Card>
        <Card>
          <h2 className="font-bold">{t("summary.fullStations")} ({full.length})</h2>
          {list(full)}
        </Card>
        <Card>
          <h2 className="font-bold">{t("summary.high" as TKey, { n: cfg.highOccupancy })} ({high.length})</h2>
          {list(high)}
          <h2 className="mt-4 font-bold">{t("summary.low", { n: cfg.lowOccupancy })} ({low.length})</h2>
          {list(low)}
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, danger }: { label: string; value: number; sub?: string; danger?: boolean }) {
  return (
    <Card>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`font-display text-4xl font-extrabold tabular ${danger ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
