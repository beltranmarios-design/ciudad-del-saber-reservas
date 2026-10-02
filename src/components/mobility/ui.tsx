import type { ReactNode } from "react";
import { AlertTriangle, BatteryCharging, Bike, CheckCircle2, Clock, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n, type TKey } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import type { StationStats } from "@/lib/mobility/rules";
import type { Config, ErrorCode, VehicleStatus, VehicleType } from "@/lib/mobility/types";
import { cn } from "@/lib/utils";

export function useErrorText() {
  const { t } = useI18n();
  const { state } = useStore();
  return (error: ErrorCode | string, params?: Record<string, string | number>) => {
    const cfg = state?.config;
    const extra: Record<string, string | number> = { ...params };
    if (error === "outside_service_hours" && cfg)
      extra.hours = t("service.hours", { open: cfg.schedule.open, close: cfg.schedule.close });
    if (error === "battery_too_low" && cfg) extra.threshold = cfg.batteryThreshold;
    return t(`err.${error}` as TKey, extra);
  };
}

export type Level = "low" | "mid" | "high" | "full";
export function occupancyLevel(s: StationStats, cfg: Config): Level {
  if (s.full) return "full";
  if (s.pct > cfg.highOccupancy) return "high";
  if (s.pct < cfg.lowOccupancy) return "low";
  return "mid";
}

export const levelClasses: Record<Level, { dot: string; soft: string; text: string }> = {
  low: { dot: "bg-info", soft: "bg-info-soft", text: "text-info" },
  mid: { dot: "bg-primary", soft: "bg-primary-soft", text: "text-primary-strong" },
  high: { dot: "bg-warning", soft: "bg-warning-soft", text: "text-warning" },
  full: { dot: "bg-destructive", soft: "bg-destructive-soft", text: "text-destructive" },
};

export function OccupancyBar({ stats, cfg }: { stats: StationStats; cfg: Config }) {
  const { t, fmtPct } = useI18n();
  const level = occupancyLevel(stats, cfg);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t("station.occupancy")} {stats.occupancy}/{stats.station.capacity}
        </span>
        <span className="tabular">{fmtPct(stats.pct)}</span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stats.station.capacity}
        aria-valuenow={stats.occupancy}
        aria-label={t("station.occupancy")}
      >
        <div className={cn("h-full rounded-full", levelClasses[level].dot)} style={{ width: `${Math.min(100, stats.pct)}%` }} />
      </div>
    </div>
  );
}

export function VehicleIcon({ type, className }: { type: VehicleType; className?: string }) {
  return type === "bike" ? <Bike className={className} aria-hidden /> : <Zap className={className} aria-hidden />;
}

const statusStyle: Record<VehicleStatus, { cls: string; Icon: typeof Bike }> = {
  available: { cls: "bg-primary-soft text-primary-strong", Icon: CheckCircle2 },
  loaned: { cls: "bg-info-soft text-info", Icon: Clock },
  maintenance: { cls: "bg-warning-soft text-warning", Icon: Wrench },
  charging: { cls: "bg-muted text-muted-foreground", Icon: BatteryCharging },
};

export function StatusPill({ status }: { status: VehicleStatus }) {
  const { t } = useI18n();
  const { cls, Icon } = statusStyle[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>
      <Icon className="size-3.5" aria-hidden />
      {t(`status.${status}` as TKey)}
    </span>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "info" | "warn" | "danger" | "muted"; children: ReactNode }) {
  const cls = {
    ok: "bg-primary-soft text-primary-strong",
    info: "bg-info-soft text-info",
    warn: "bg-warning-soft text-warning",
    danger: "bg-destructive-soft text-destructive",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>{children}</span>;
}

export function BatteryValue({ value, threshold }: { value?: number; threshold: number }) {
  if (value === undefined) return null;
  const low = value <= threshold;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular text-xs font-semibold", low ? "text-destructive" : "text-foreground")}>
      {low && <AlertTriangle className="size-3.5" aria-hidden />}
      {value} %
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border bg-card p-4 shadow-card", className)}>{children}</div>;
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-1 text-sm font-medium text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
      <p className="text-muted-foreground">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="min-h-11">{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={cn("min-h-11", destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const inputCls =
  "min-h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-ring aria-[invalid=true]:border-destructive";

export function Select({
  value,
  onChange,
  children,
  id,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  id: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {children}
      </select>
    </div>
  );
}

export { Button };
