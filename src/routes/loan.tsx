import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Ban, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useNow, useStore } from "@/lib/mobility/store";
import {
  activeLoanOf,
  allStationStats,
  findUserByCredential,
  isOverdueDuration,
  returnVehicle,
  stationsWithSpace,
} from "@/lib/mobility/rules";
import type { AppState, Loan } from "@/lib/mobility/types";
import { Card, EmptyState, FieldError, PageHeader, Pill, VehicleIcon, inputCls, useErrorText } from "@/components/mobility/ui";
import { Identify } from "@/components/mobility/Identify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/loan")({
  head: () => ({
    meta: [
      { title: "Mi préstamo — Movilidad del campus" },
      { name: "description", content: "Consulta tu préstamo activo, el tiempo restante y devuelve el vehículo en cualquier estación." },
      { property: "og:title", content: "Mi préstamo — Movilidad del campus" },
      { property: "og:description", content: "Tiempo restante y devolución del vehículo del campus." },
    ],
  }),
  component: LoanPage,
});

function LoanPage() {
  const { t, fmtTime, fmtDuration } = useI18n();
  const { state, sessionCredential, setSessionCredential } = useStore();
  const now = useNow(1000);
  const [returning, setReturning] = useState(false);
  const [returned, setReturned] = useState<Loan | null>(null);
  if (!state) return null;
  const user = sessionCredential ? findUserByCredential(state, sessionCredential) : undefined;

  if (!user)
    return (
      <>
        <PageHeader title={t("loan.title")} />
        <Identify />
      </>
    );

  const loan = activeLoanOf(state, user.id);
  const header = (
    <PageHeader
      title={t("loan.title")}
      subtitle={`${user.name} · ${t("loan.signedAs", { credential: user.credential })}`}
      actions={
        <Button variant="outline" onClick={() => setSessionCredential(null)}>
          {t("loan.switchUser")}
        </Button>
      }
    />
  );

  if (returned) {
    const v = state.vehicles.find((x) => x.id === returned.vehicleId);
    const st = state.stations.find((x) => x.id === returned.returnStationId);
    return (
      <>
        {header}
        <Card className="mx-auto max-w-lg text-center">
          <CheckCircle2 className="mx-auto size-12 text-primary-strong" aria-hidden />
          <h2 className="mt-2 text-2xl font-extrabold">{t("return.success")}</h2>
          <p className="mt-2" role="status">
            {t("return.successBody", { vehicle: v?.code ?? "", station: st?.name ?? "", duration: fmtDuration(returned.durationMs ?? 0) })}
          </p>
          {returned.overdue && <p className="mt-2 font-semibold text-destructive">{t("return.successOverdue")}</p>}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild variant="outline">
              <Link to="/history">{t("nav.history")}</Link>
            </Button>
            <Button onClick={() => setReturned(null)}>{t("common.close")}</Button>
          </div>
        </Card>
      </>
    );
  }

  if (!loan)
    return (
      <>
        {header}
        <EmptyState
          title={`${t("loan.none")} ${t("loan.noneAction")}`}
          action={
            <Button asChild>
              <Link to="/">{t("nav.stations")}</Link>
            </Button>
          }
        />
      </>
    );

  const vehicle = state.vehicles.find((v) => v.id === loan.vehicleId)!;
  const origin = state.stations.find((s) => s.id === loan.originStationId);
  const elapsed = now - loan.startAt;
  const overdue = isOverdueDuration(elapsed, state.config);
  const remaining = loan.dueAt - now;

  return (
    <>
      {header}
      <Card className={cn("mx-auto max-w-2xl", overdue && "border-destructive")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-primary-soft">
              <VehicleIcon type={vehicle.type} className="size-6 text-primary-strong" />
            </span>
            <div>
              <div className="font-display text-2xl font-extrabold">{vehicle.code}</div>
              <div className="text-sm text-muted-foreground">{vehicle.type === "bike" ? t("common.bike") : t("common.scooter")}</div>
            </div>
          </div>
          {overdue ? <Pill tone="danger">{t("status.overdue")}</Pill> : <Pill tone="ok">{t("status.onTime")}</Pill>}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Item label={t("checkout.from")} value={origin?.name ?? "—"} />
          <Item label={t("loan.start")} value={fmtTime(loan.startAt)} />
          <Item label={t("loan.due")} value={fmtTime(loan.dueAt)} />
          <Item label={t("loan.elapsed")} value={fmtDuration(elapsed)} big />
          <Item
            label={overdue ? t("loan.exceeded") : t("loan.remaining")}
            value={overdue ? `+${fmtDuration(elapsed - state.config.maxLoanMinutes * 60_000)}` : fmtDuration(Math.max(0, remaining))}
            big
            danger={overdue}
          />
        </dl>
        {!user.active && <p className="mt-4 rounded-xl bg-warning-soft p-3 text-sm font-medium text-warning">{t("loan.inactiveNote")}</p>}
        <Button size="lg" className="mt-5 w-full" onClick={() => setReturning(true)}>
          {t("loan.return")}
        </Button>
      </Card>
      <ReturnDialog
        open={returning}
        onOpenChange={setReturning}
        state={state}
        loan={loan}
        onDone={(l) => {
          setReturning(false);
          setReturned(l);
        }}
      />
    </>
  );
}

function Item({ label, value, big, danger }: { label: string; value: string; big?: boolean; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold tabular", big && "font-display text-xl font-extrabold", danger && "text-destructive")}>{value}</dd>
    </div>
  );
}

function ReturnDialog({
  open,
  onOpenChange,
  state,
  loan,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: AppState;
  loan: Loan;
  onDone: (l: Loan) => void;
}) {
  const { t } = useI18n();
  const { run } = useStore();
  const errText = useErrorText();
  const vehicle = state.vehicles.find((v) => v.id === loan.vehicleId)!;
  const [stationId, setStationId] = useState("");
  const [battery, setBattery] = useState(vehicle.battery !== undefined ? String(vehicle.battery) : "");
  const [error, setError] = useState<string | null>(null);
  const [batteryError, setBatteryError] = useState<string | null>(null);
  const busy = useRef(false);
  const stats = allStationStats(state);
  const chosen = stats.find((s) => s.station.id === stationId);
  const isScooter = vehicle.type === "scooter";

  const submit = () => {
    if (busy.current) return;
    if (!stationId) return setError(t("err.required"));
    let b: number | undefined;
    if (isScooter) {
      b = battery.trim() === "" ? NaN : Number(battery);
      if (!Number.isInteger(b) || b < 0 || b > 100) return setBatteryError(t("err.invalid_battery"));
    }
    busy.current = true;
    const res = run((s) => returnVehicle(s, { loanId: loan.id, stationId, battery: b, now: Date.now() }));
    busy.current = false;
    if (res.ok && "loan" in res) onDone(res.loan);
    else if (!res.ok) setError(errText(res.error, res.params));
  };

  const suggestions = chosen?.full ? stationsWithSpace(state, chosen.station.id).slice(0, 3) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("return.title")} · {vehicle.code}</DialogTitle>
          <DialogDescription>{t("return.chooseStation")}</DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="sr-only">{t("return.chooseStation")}</legend>
          <ul className="space-y-2">
            {stats.map((s) => (
              <li key={s.station.id}>
                <label
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring",
                    stationId === s.station.id && "border-primary bg-primary-soft",
                    s.full && "bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="ret"
                    value={s.station.id}
                    checked={stationId === s.station.id}
                    onChange={() => {
                      setStationId(s.station.id);
                      setError(null);
                    }}
                    className="size-4 accent-primary"
                  />
                  <span className="flex-1 text-sm font-semibold">{s.station.name}</span>
                  {s.full ? (
                    <Pill tone="danger">
                      <Ban className="size-3.5" aria-hidden />
                      {t("return.full")}
                    </Pill>
                  ) : (
                    <span className="text-xs font-semibold text-primary-strong tabular">{t("return.freeSpaces", { n: s.free })}</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {chosen?.full && (
          <div className="rounded-xl bg-destructive-soft p-3 text-sm" role="alert">
            <p className="font-semibold text-destructive">{t("return.fullError")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button key={s.station.id} variant="outline" size="sm" onClick={() => setStationId(s.station.id)}>
                  {s.station.name} ({s.free})
                </Button>
              ))}
            </div>
          </div>
        )}
        {isScooter && (
          <div>
            <label htmlFor="bat" className="mb-1 block text-sm font-semibold">
              {t("return.battery")}
            </label>
            <input
              id="bat"
              inputMode="numeric"
              className={inputCls}
              value={battery}
              aria-invalid={!!batteryError}
              aria-describedby="bat-help bat-err"
              onChange={(e) => {
                setBattery(e.target.value);
                setBatteryError(null);
              }}
            />
            <p id="bat-help" className="mt-1 text-xs text-muted-foreground">
              {t("return.batteryHelp", { threshold: state.config.batteryThreshold })}
            </p>
            <FieldError id="bat-err">{batteryError}</FieldError>
          </div>
        )}
        {error && !chosen?.full && <FieldError>{error}</FieldError>}
        <Button size="lg" className="w-full" disabled={!stationId || !!chosen?.full} onClick={submit}>
          {t("return.confirm")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
