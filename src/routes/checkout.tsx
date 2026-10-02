import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { useNow, useStore } from "@/lib/mobility/store";
import { activeLoanOf, checkout, previewCheckout, stationStats } from "@/lib/mobility/rules";
import type { Loan, VehicleType } from "@/lib/mobility/types";
import { BatteryValue, Card, FieldError, PageHeader, Pill, Select, VehicleIcon, inputCls, useErrorText } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const search = z.object({
  station: z.string().optional(),
  type: z.enum(["bike", "scooter"]).optional(),
});

export const Route = createFileRoute("/checkout")({
  validateSearch: (s) => search.parse(s),
  head: () => ({
    meta: [
      { title: "Retirar vehículo — Movilidad del campus" },
      { name: "description", content: "Retira una bicicleta o un scooter con tu credencial del campus." },
      { property: "og:title", content: "Retirar vehículo — Movilidad del campus" },
      { property: "og:description", content: "Flujo de retiro con credencial en las estaciones del campus." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { t, fmtTime } = useI18n();
  const params = Route.useSearch();
  const { state, run, setSessionCredential } = useStore();
  const errText = useErrorText();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const [step, setStep] = useState(1);
  const [stationId, setStationId] = useState(params.station ?? state?.stations[0]?.id ?? "");
  const [type, setType] = useState<VehicleType>(params.type ?? "bike");
  const [credential, setCredential] = useState("");
  const [credError, setCredError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<Loan | null>(null);
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  if (!state) return null;
  const station = state.stations.find((s) => s.id === stationId);
  const preview = previewCheckout(state, { credential, stationId, type, now });

  const toReview = () => {
    if (!credential.trim()) return setCredError(t("err.required"));
    if (!preview.ok) {
      const credErrors = ["credential_not_found", "user_inactive", "user_has_active_loan"];
      if (credErrors.includes(preview.error)) return setCredError(errText(preview.error));
    }
    setCredError(null);
    setSubmitError(null);
    setStep(3);
  };

  const confirm = () => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    const res = run((s) => checkout(s, { credential, stationId, type, now: Date.now() }));
    if (res.ok && "loan" in res) {
      const user = state.users.find((u) => u.id === res.loan.userId);
      if (user) setSessionCredential(user.credential);
      setDone(res.loan);
    } else if (!res.ok) {
      setSubmitError(errText(res.error, res.params));
      busy.current = false;
    }
    setSubmitting(false);
  };

  if (done) {
    const v = state.vehicles.find((x) => x.id === done.vehicleId);
    const st = state.stations.find((x) => x.id === done.originStationId);
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CheckCircle2 className="mx-auto size-12 text-primary-strong" aria-hidden />
        <h1 className="mt-2 text-2xl font-extrabold">{t("checkout.success")}</h1>
        <p className="mt-2" role="status">
          {t("checkout.successBody", { vehicle: v?.code ?? "", station: st?.name ?? "", start: fmtTime(done.startAt), due: fmtTime(done.dueAt) })}
        </p>
        <Button className="mt-5 w-full" onClick={() => navigate({ to: "/loan" })}>
          {t("checkout.goLoan")}
        </Button>
      </Card>
    );
  }

  const steps = [t("checkout.step1"), t("checkout.step2"), t("checkout.step3")];
  const stats = station ? stationStats(state, station) : null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("checkout.title")} />
      <ol className="mb-5 grid grid-cols-3 gap-2 text-xs font-semibold">
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "rounded-xl border px-2 py-2 text-center",
              step === i + 1 ? "border-primary bg-primary-soft text-primary-strong" : step > i + 1 ? "bg-card" : "bg-muted text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card className="space-y-4">
          <Select id="station" label={t("common.station")} value={stationId} onChange={setStationId}>
            {state.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t("common.type")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["bike", "scooter"] as const).map((ty) => (
                <label
                  key={ty}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border p-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring",
                    type === ty && "border-primary bg-primary-soft",
                  )}
                >
                  <input type="radio" name="type" value={ty} checked={type === ty} onChange={() => setType(ty)} className="sr-only" />
                  <VehicleIcon type={ty} className="size-5" />
                  <span className="font-semibold">{ty === "bike" ? t("common.bike") : t("common.scooter")}</span>
                  <span className="ml-auto font-display text-lg font-extrabold tabular">
                    {stats ? (ty === "bike" ? stats.availableBikes : stats.eligibleScooters) : 0}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-between gap-2">
            <Button variant="outline" asChild>
              <Link to="/">{t("common.back")}</Link>
            </Button>
            <Button onClick={() => setStep(2)}>{t("common.next")}</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <div>
            <label htmlFor="cred" className="mb-1 block text-sm font-semibold">
              {t("checkout.credential")}
            </label>
            <input
              id="cred"
              className={inputCls}
              value={credential}
              autoComplete="off"
              aria-invalid={!!credError}
              aria-describedby="cred-help cred-err"
              placeholder="CDS-1007"
              onChange={(e) => {
                setCredential(e.target.value);
                setCredError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && toReview()}
            />
            <p id="cred-help" className="mt-1 text-xs text-muted-foreground">
              {t("checkout.credentialHelp")}
            </p>
            <FieldError id="cred-err">{credError}</FieldError>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">{t("checkout.demoUsers")}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {state.users.map((u) => {
                const loan = activeLoanOf(state, u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCredential(u.credential);
                        setCredError(null);
                      }}
                      className={cn(
                        "flex min-h-11 w-full flex-col items-start rounded-xl border px-3 py-2 text-left text-sm hover:bg-accent",
                        credential.toUpperCase() === u.credential && "border-primary bg-primary-soft",
                      )}
                    >
                      <span className="font-semibold">{u.name}</span>
                      <span className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {u.credential}
                        {!u.active && <Pill tone="muted">{t("status.inactive")}</Pill>}
                        {loan && <Pill tone="info">{t("users.hasLoan")}</Pill>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              {t("common.back")}
            </Button>
            <Button onClick={toReview}>{t("common.next")}</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("checkout.from")}</dt>
              <dd className="font-semibold">{station?.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("common.user")}</dt>
              <dd className="font-semibold">{preview.ok ? preview.user.name : credential.toUpperCase()}</dd>
            </div>
            {preview.ok && (
              <>
                <div>
                  <dt className="text-muted-foreground">{t("checkout.assigned")}</dt>
                  <dd className="flex items-center gap-2 font-display text-xl font-extrabold">
                    <VehicleIcon type={preview.vehicle.type} className="size-5 text-primary-strong" />
                    {preview.vehicle.code}
                    <BatteryValue value={preview.vehicle.battery} threshold={state.config.batteryThreshold} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("checkout.due")}</dt>
                  <dd className="font-display text-xl font-extrabold tabular">{fmtTime(preview.dueAt)}</dd>
                </div>
              </>
            )}
          </dl>
          {!preview.ok && <FieldError>{errText(preview.error)}</FieldError>}
          {submitError && <FieldError>{submitError}</FieldError>}
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
              {t("common.back")}
            </Button>
            <Button onClick={confirm} disabled={!preview.ok || submitting}>
              {t("checkout.confirm")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
