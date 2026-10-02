import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n, type TKey } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import { updateConfig, validateConfig } from "@/lib/mobility/rules";
import type { Config, ScheduleOverride } from "@/lib/mobility/types";
import { Card, ConfirmDialog, FieldError, PageHeader, inputCls, useErrorText } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ops/settings")({
  head: () => ({
    meta: [
      { title: "Configuración — Movilidad del campus" },
      { name: "description", content: "Duración del préstamo, umbrales de batería y ocupación, y horario del servicio." },
      { property: "og:title", content: "Configuración — Movilidad del campus" },
      { property: "og:description", content: "Parámetros del servicio de movilidad del campus." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { t } = useI18n();
  const { state, run, reset } = useStore();
  const errText = useErrorText();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [days, setDays] = useState<number[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!state) return null;
  const c = state.config;
  const f = form ?? {
    maxLoanMinutes: String(c.maxLoanMinutes),
    batteryThreshold: String(c.batteryThreshold),
    highOccupancy: String(c.highOccupancy),
    lowOccupancy: String(c.lowOccupancy),
    open: c.schedule.open,
    close: c.schedule.close,
  };
  const d = days ?? c.schedule.days;
  const set = (k: string, v: string) => setForm({ ...f, [k]: v });

  const save = () => {
    const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
    const next: Config = {
      ...c,
      maxLoanMinutes: num(f.maxLoanMinutes),
      batteryThreshold: num(f.batteryThreshold),
      highOccupancy: num(f.highOccupancy),
      lowOccupancy: num(f.lowOccupancy),
      schedule: { ...c.schedule, open: f.open, close: f.close, days: [...d].sort() },
    };
    const errs = validateConfig(next);
    setErrors(errs);
    if (errs.length) return toast.error(t("settings.invalid"));
    const r = run((s) => updateConfig(s, next));
    if (r.ok) {
      setForm(null);
      setDays(null);
      toast.success(t("settings.saved"));
    } else toast.error(errText(r.error));
  };

  const field = (k: string, label: TKey, type = "text") => (
    <div>
      <label htmlFor={`cfg-${k}`} className="mb-1 block text-sm font-semibold">{t(label)}</label>
      <input id={`cfg-${k}`} type={type} inputMode={type === "text" ? "numeric" : undefined} className={inputCls} value={f[k]} aria-invalid={errors.includes(k)} onChange={(e) => set(k, e.target.value)} />
      {errors.includes(k) && <FieldError>{t("settings.fieldInvalid")}</FieldError>}
    </div>
  );

  const setOverride = (o: ScheduleOverride) => {
    const r = run((s) => updateConfig(s, { ...s.config, scheduleOverride: o }));
    if (!r.ok) toast.error(errText(r.error));
  };

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {field("maxLoanMinutes", "settings.maxLoan")}
            {field("batteryThreshold", "settings.battery")}
            <div className="grid grid-cols-2 gap-3">
              {field("highOccupancy", "settings.high")}
              {field("lowOccupancy", "settings.low")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("open", "settings.open", "time")}
              {field("close", "settings.close", "time")}
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">{t("settings.days")}</legend>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((n) => (
                  <label key={n} className={cn("inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring", d.includes(n) && "border-primary bg-primary-soft text-primary-strong")}>
                    <input type="checkbox" className="sr-only" checked={d.includes(n)} onChange={() => setDays(d.includes(n) ? d.filter((x) => x !== n) : [...d, n])} />
                    {t(`days.${n}` as TKey)}
                  </label>
                ))}
              </div>
              {errors.includes("days") && <FieldError>{t("settings.fieldInvalid")}</FieldError>}
            </fieldset>
            <p className="text-xs text-muted-foreground">{c.schedule.timeZone}</p>
            <Button type="submit" className="w-full">{t("common.save")}</Button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="border-warning">
            <h2 className="font-bold">{t("settings.demoClock")}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{t("settings.demoClockHelp")}</p>
            <div role="radiogroup" aria-label={t("settings.demoClock")} className="grid gap-2">
              {(["auto", "open", "closed"] as const).map((o) => (
                <Button key={o} role="radio" aria-checked={c.scheduleOverride === o} variant={c.scheduleOverride === o ? "default" : "outline"} onClick={() => setOverride(o)}>
                  {t(`settings.demo.${o}` as TKey)}
                </Button>
              ))}
            </div>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">{t("settings.storageNote")}</p>
            <Button variant="destructive" className="mt-3 w-full" onClick={() => setConfirmReset(true)}>{t("settings.reset")}</Button>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("settings.reset")}
        description={t("settings.resetWarn")}
        confirmLabel={t("settings.reset")}
        destructive
        onConfirm={() => {
          if (reset()) {
            setForm(null);
            setDays(null);
            toast.success(t("settings.resetDone"));
          } else toast.error(t("err.save_failed"));
        }}
      />
    </>
  );
}
