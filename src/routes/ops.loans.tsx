import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useNow, useStore } from "@/lib/mobility/store";
import { loanIsOverdue } from "@/lib/mobility/rules";
import type { Loan } from "@/lib/mobility/types";
import { Card, EmptyState, PageHeader, Pill, VehicleIcon } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/ops/loans")({
  head: () => ({
    meta: [
      { title: "Préstamos — Movilidad del campus" },
      { name: "description", content: "Préstamos activos y devueltos, con señalización de excedidos." },
      { property: "og:title", content: "Préstamos — Movilidad del campus" },
      { property: "og:description", content: "Seguimiento de préstamos del campus." },
    ],
  }),
  component: Loans,
});

function Loans() {
  const { t, fmtDateTime, fmtDuration } = useI18n();
  const { state } = useStore();
  const now = useNow(15_000);
  const [tab, setTab] = useState<"active" | "returned">("active");
  const [onlyOver, setOnlyOver] = useState(false);
  const [detail, setDetail] = useState<Loan | null>(null);
  if (!state) return null;
  const cfg = state.config;
  const list = state.loans
    .filter((l) => l.status === tab)
    .filter((l) => !onlyOver || loanIsOverdue(l, now, cfg))
    .sort((a, b) => b.startAt - a.startAt);
  const user = (id: string) => state.users.find((u) => u.id === id);
  const org = (id?: string) => state.organizations.find((o) => o.id === id)?.name ?? "—";
  const st = (id?: string) => state.stations.find((s) => s.id === id)?.name ?? "—";
  const veh = (id: string) => state.vehicles.find((v) => v.id === id);
  const dur = (l: Loan) => (l.status === "active" ? now - l.startAt : l.durationMs ?? 0);

  return (
    <>
      <PageHeader title={t("nav.loans")} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1 rounded-xl border bg-card p-1">
          {(["active", "returned"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${tab === k ? "bg-info text-info-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              {t(k === "active" ? "loans.active" : "loans.returned")} ({state.loans.filter((l) => l.status === k).length})
            </button>
          ))}
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} />
          {t("loans.onlyOverdue")}
        </label>
      </div>
      {list.length === 0 ? (
        <EmptyState title={t("loans.empty")} action={onlyOver ? <Button variant="outline" onClick={() => setOnlyOver(false)}>{t("common.all")}</Button> : undefined} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  {[t("common.user"), t("common.vehicle"), t("loans.origin"), t("loans.dest"), t("loans.start"), t("loans.end"), t("loans.duration"), ""].map((h, i) => (
                    <th key={i} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  const u = user(l.userId);
                  const over = loanIsOverdue(l, now, cfg);
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2"><div className="font-semibold">{u?.name}</div><div className="text-xs text-muted-foreground">{org(u?.orgId)}</div></td>
                      <td className="px-3 py-2 font-semibold">{veh(l.vehicleId)?.code}</td>
                      <td className="px-3 py-2">{st(l.originStationId)}</td>
                      <td className="px-3 py-2">{st(l.returnStationId)}</td>
                      <td className="px-3 py-2 tabular">{fmtDateTime(l.startAt)}</td>
                      <td className="px-3 py-2 tabular">{l.returnedAt ? fmtDateTime(l.returnedAt) : "—"}</td>
                      <td className="px-3 py-2"><span className="tabular">{fmtDuration(dur(l))}</span> {over && <Pill tone="danger">{t("status.overdue")}</Pill>}</td>
                      <td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => setDetail(l)}>{t("common.details")}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y md:hidden">
            {list.map((l) => {
              const u = user(l.userId);
              const v = veh(l.vehicleId);
              return (
                <li key={l.id}>
                  <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setDetail(l)}>
                    {v && <VehicleIcon type={v.type} className="size-5 text-primary-strong" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{v?.code} · {u?.name}</span>
                      <span className="block text-xs text-muted-foreground">{st(l.originStationId)} → {st(l.returnStationId)} · {fmtDuration(dur(l))}</span>
                    </span>
                    {loanIsOverdue(l, now, cfg) && <Pill tone="danger">{t("status.overdue")}</Pill>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.id}</DialogTitle>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  [t("common.user"), `${user(detail.userId)?.name} (${user(detail.userId)?.credential})`],
                  [t("common.organization"), org(user(detail.userId)?.orgId)],
                  [t("common.vehicle"), veh(detail.vehicleId)?.code],
                  [t("common.status"), t(detail.status === "active" ? "status.active" : "status.returned")],
                  [t("loans.origin"), st(detail.originStationId)],
                  [t("loans.dest"), st(detail.returnStationId)],
                  [t("loans.start"), fmtDateTime(detail.startAt)],
                  [t("loan.due"), fmtDateTime(detail.dueAt)],
                  [t("loans.end"), detail.returnedAt ? fmtDateTime(detail.returnedAt) : "—"],
                  [t("loans.duration"), fmtDuration(dur(detail))],
                  [t("status.overdue"), loanIsOverdue(detail, now, cfg) ? t("common.yes") : t("common.no")],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
