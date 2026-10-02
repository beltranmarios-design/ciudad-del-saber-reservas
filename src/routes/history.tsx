import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import { findUserByCredential } from "@/lib/mobility/rules";
import { Card, EmptyState, PageHeader, Pill, VehicleIcon } from "@/components/mobility/ui";
import { Identify } from "@/components/mobility/Identify";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Historial — Movilidad del campus" },
      { name: "description", content: "Historial de préstamos devueltos con duración y marca de exceso." },
      { property: "og:title", content: "Historial — Movilidad del campus" },
      { property: "og:description", content: "Tus préstamos anteriores en el campus." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { t, fmtDateTime, fmtDuration } = useI18n();
  const { state, sessionCredential, setSessionCredential } = useStore();
  if (!state) return null;
  const user = sessionCredential ? findUserByCredential(state, sessionCredential) : undefined;
  if (!user)
    return (
      <>
        <PageHeader title={t("history.title")} />
        <Identify />
      </>
    );
  const loans = state.loans
    .filter((l) => l.userId === user.id && l.status === "returned")
    .sort((a, b) => (b.returnedAt ?? 0) - (a.returnedAt ?? 0));
  const name = (id?: string) => state.stations.find((s) => s.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title={t("history.title")}
        subtitle={`${user.name} · ${user.credential}`}
        actions={
          <Button variant="outline" onClick={() => setSessionCredential(null)}>
            {t("loan.switchUser")}
          </Button>
        }
      />
      {loans.length === 0 ? (
        <EmptyState
          title={t("history.empty")}
          action={
            <Button asChild>
              <Link to="/">{t("nav.stations")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {loans.map((l) => {
            const v = state.vehicles.find((x) => x.id === l.vehicleId);
            return (
              <li key={l.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-display text-lg font-extrabold">
                      {v && <VehicleIcon type={v.type} className="size-5 text-primary-strong" />}
                      {v?.code}
                    </span>
                    {l.overdue ? <Pill tone="danger">{t("status.overdue")}</Pill> : <Pill tone="ok">{t("status.onTime")}</Pill>}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t("loans.origin")}</dt>
                      <dd>{name(l.originStationId)}</dd>
                      <dd className="text-xs text-muted-foreground">{fmtDateTime(l.startAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("loans.dest")}</dt>
                      <dd>{name(l.returnStationId)}</dd>
                      <dd className="text-xs text-muted-foreground">{l.returnedAt && fmtDateTime(l.returnedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("history.duration")}</dt>
                      <dd className="font-semibold tabular">{fmtDuration(l.durationMs ?? 0)}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
