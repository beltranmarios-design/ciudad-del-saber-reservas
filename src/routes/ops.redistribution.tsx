import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import { applySuggestion, planRedistribution, type Suggestion } from "@/lib/mobility/rules";
import { Card, ConfirmDialog, EmptyState, PageHeader, useErrorText } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ops/redistribution")({
  head: () => ({
    meta: [
      { title: "Redistribución — Movilidad del campus" },
      { name: "description", content: "Movimientos sugeridos entre estaciones llenas y vacías del campus." },
      { property: "og:title", content: "Redistribución — Movilidad del campus" },
      { property: "og:description", content: "Plan de redistribución de vehículos del campus." },
    ],
  }),
  component: Redistribution,
});

function Redistribution() {
  const { t, fmtPct, fmtDateTime } = useI18n();
  const { state, run } = useStore();
  const errText = useErrorText();
  const [pending, setPending] = useState<Suggestion | null>(null);
  const [outdated, setOutdated] = useState(false);
  if (!state) return null;
  const cfg = state.config;
  const plan = planRedistribution(state);
  const name = (id: string) => state.stations.find((s) => s.id === id)?.name ?? id;
  const code = (id: string) => state.vehicles.find((v) => v.id === id)?.code ?? id;

  const confirm = () => {
    if (!pending) return;
    const res = run((s) => applySuggestion(s, pending.key, Date.now(), t("nav.ops"), t("redis.defaultReason")));
    setPending(null);
    if (res.ok) {
      setOutdated(false);
      toast.success(t("redis.done"));
    } else if (res.error === "plan_outdated") setOutdated(true);
    else toast.error(errText(res.error));
  };

  return (
    <>
      <PageHeader title={t("redis.title")} subtitle={t("redis.rule", { high: cfg.highOccupancy, low: cfg.lowOccupancy })} />
      {outdated && <p className="mb-4 rounded-xl bg-warning-soft p-3 text-sm font-medium text-warning" role="alert">{t("redis.outdated")}</p>}
      {plan.length === 0 ? (
        <EmptyState title={t("redis.none")} />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{t("redis.approx")}</p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {plan.map((p) => (
              <li key={p.key}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2 font-bold">
                    <span>{name(p.originId)}</span>
                    <ArrowRight className="size-4 text-info" aria-label="→" />
                    <span>{name(p.destId)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t("redis.reason", { high: cfg.highOccupancy, low: cfg.lowOccupancy })}</p>
                  <p className="mt-2 text-sm">
                    <strong>{p.bikes}</strong> {t("common.bikes").toLowerCase()} · <strong>{p.scooters}</strong> {t("common.scooters").toLowerCase()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.vehicleIds.map(code).join(", ")}</p>
                  <table className="mt-3 w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr><th className="font-medium" /><th className="font-medium">{t("redis.before")}</th><th className="font-medium">{t("redis.after")}</th></tr>
                    </thead>
                    <tbody className="tabular">
                      <tr><td>{t("loans.origin")}</td><td>{fmtPct(p.before.origin)}</td><td className="font-semibold">{fmtPct(p.after.origin)}</td></tr>
                      <tr><td>{t("loans.dest")}</td><td>{fmtPct(p.before.dest)}</td><td className="font-semibold">{fmtPct(p.after.dest)}</td></tr>
                    </tbody>
                  </table>
                  <Button className="mt-3 w-full" variant="info" onClick={() => setPending(p)}>{t("redis.confirm")}</Button>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="mb-2 mt-8 text-lg font-bold">{t("redis.history")}</h2>
      {state.movements.length === 0 ? (
        <EmptyState title={t("loans.empty")} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y text-sm">
            {[...state.movements].sort((a, b) => b.at - a.at).slice(0, 30).map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-3 gap-y-1 p-3">
                <span className="font-semibold">{code(m.vehicleId)}</span>
                <span>{name(m.fromStationId)} → {name(m.toStationId)}</span>
                <span className="text-muted-foreground">{fmtDateTime(m.at)} · {t("redis.responsible")}: {m.responsible} · {t("redis.reasonLabel")}: {m.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={t("redis.confirmTitle")}
        description={pending ? t("redis.confirmBody", { n: pending.vehicleIds.length, from: name(pending.originId), to: name(pending.destId) }) : ""}
        confirmLabel={t("redis.confirm")}
        onConfirm={confirm}
      />
    </>
  );
}
