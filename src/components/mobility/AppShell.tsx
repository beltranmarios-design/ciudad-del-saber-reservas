import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Clock, FlaskConical, History, MapPinned, Settings2 } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";
import { useNow, useStore } from "@/lib/mobility/store";
import { isServiceOpen } from "@/lib/mobility/rules";
import { resetState, getBrowserStorage } from "@/lib/mobility/storage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ConfirmDialog } from "./ui";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="12" className="fill-primary" />
      <circle cx="13" cy="25" r="5.5" fill="none" strokeWidth="2.5" className="stroke-primary-foreground" />
      <circle cx="27" cy="25" r="5.5" fill="none" strokeWidth="2.5" className="stroke-primary-foreground" />
      <path d="M13 25 L18 15 H25 L27 25 M18 15 L22 25" fill="none" strokeWidth="2.5" strokeLinejoin="round" className="stroke-primary-foreground" />
      <circle cx="30" cy="11" r="3" className="fill-info" />
    </svg>
  );
}

function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t("nav.language")} className="flex rounded-xl border bg-card p-0.5">
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn(
            "min-h-10 min-w-10 rounded-lg px-2 text-sm font-bold uppercase",
            lang === l ? "bg-primary-strong text-primary-foreground" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const USER_NAV: Array<{ to: "/" | "/loan" | "/history"; key: TKey; Icon: typeof Clock }> = [
  { to: "/", key: "nav.stations", Icon: MapPinned },
  { to: "/loan", key: "nav.myLoan", Icon: Clock },
  { to: "/history", key: "nav.history", Icon: History },
];

function ServiceStatus() {
  const { t } = useI18n();
  const { state } = useStore();
  const now = useNow(30_000);
  if (!state) return null;
  const open = isServiceOpen(now, state.config);
  const simulated = state.config.scheduleOverride !== "auto";
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold md:inline-flex",
        open ? "bg-primary-soft text-primary-strong" : "bg-warning-soft text-warning",
        simulated && "border-2 border-dashed border-info",
      )}
    >
      <span className={cn("size-2 rounded-full", open ? "bg-primary" : "bg-warning")} aria-hidden />
      {open ? t("service.open") : t("service.closed")}
      {simulated && <span className="text-info">({t("service.simulated")})</span>}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inOps = pathname.startsWith("/ops");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <Link to="/" className="flex min-w-0 items-center gap-2 rounded-xl">
            <BrandMark className="size-9 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-base font-extrabold">{t("app.name")}</span>
              <span className="block truncate text-xs text-muted-foreground">{t("app.org")}</span>
            </span>
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label={t("nav.userArea")}>
            {USER_NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: true }}
                className="rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent"
                activeProps={{ className: "bg-primary-soft !text-primary-strong" }}
              >
                {n.key && t(n.key)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ServiceStatus />
            <Link
              to="/ops"
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-accent",
                inOps ? "bg-info-soft text-info" : "text-foreground",
              )}
            >
              <Settings2 className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("nav.ops")}</span>
              <span className="sr-only sm:hidden">{t("nav.ops")}</span>
            </Link>
            <LangToggle />
          </div>
        </div>
      </header>
      <DemoClockBanner />
      <main className={cn("mx-auto w-full max-w-7xl flex-1 px-4 py-5", !inOps && "pb-28 md:pb-8")}>{children}</main>
      {!inOps && (
        <nav
          aria-label={t("nav.userArea")}
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <div className="grid grid-cols-3">
            {USER_NAV.map(({ to, key, Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: true }}
                className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground"
                activeProps={{ className: "!text-primary-strong" }}
              >
                <Icon className="size-5" aria-hidden />
                {t(key)}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

export function StoreGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { status, corruptRaw, reload, reset } = useStore();
  const [confirm, setConfirm] = useState(false);
  if (status === "loading")
    return <p className="py-16 text-center text-muted-foreground" role="status">{t("common.loading")}</p>;
  if (status === "blocked")
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6 text-center shadow-card" role="alert">
        <p>{t("storage.blocked")}</p>
        <Button className="mt-4" onClick={reload}>{t("storage.retry")}</Button>
      </div>
    );
  if (status === "corrupt")
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6 shadow-card" role="alert">
        <p className="font-semibold">{t("storage.corrupt")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const blob = new Blob([corruptRaw ?? ""], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "campus_mobility_backup.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            {t("storage.download")}
          </Button>
          <Button variant="outline" onClick={reload}>{t("storage.retry")}</Button>
          <Button variant="destructive" onClick={() => setConfirm(true)}>{t("settings.reset")}</Button>
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={t("settings.reset")}
          description={t("settings.resetWarn")}
          confirmLabel={t("settings.reset")}
          destructive
          onConfirm={() => {
            if (!reset()) resetState(getBrowserStorage());
          }}
        />
      </div>
    );
  return <>{children}</>;
}

export function DemoClockBanner() {
  const { t } = useI18n();
  const { state } = useStore();
  if (!state || state.config.scheduleOverride === "auto") return null;
  const mode = state.config.scheduleOverride;
  return (
    <div
      role="status"
      data-testid="demo-clock-banner"
      className="sticky top-[57px] z-20 border-b-2 border-dashed border-info bg-info-soft text-info"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2 text-sm">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        <strong className="font-bold">{t(mode === "open" ? "service.demoBanner.open" : "service.demoBanner.closed")}</strong>
        <span className="text-xs text-foreground/80">{t("service.demoHint")}</span>
      </div>
    </div>
  );
}
