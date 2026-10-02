import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LockKeyhole, LogOut } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";
import { OPS_ACCESS_KEY, OPS_SESSION_KEY } from "@/lib/mobility/constants";
import { Card, FieldError, inputCls } from "@/components/mobility/ui";
import { DemoClockBanner } from "@/components/mobility/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ops")({
  head: () => ({
    meta: [
      { title: "Operaciones — Movilidad del campus" },
      { name: "description", content: "Gestión de flota, estaciones, préstamos y redistribución del campus." },
      { property: "og:title", content: "Operaciones — Movilidad del campus" },
      { property: "og:description", content: "Panel del equipo de operaciones de movilidad del campus." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpsLayout,
});

const NAV: Array<{ to: "/ops" | "/ops/stations" | "/ops/fleet" | "/ops/loans" | "/ops/redistribution" | "/ops/users" | "/ops/settings"; key: TKey }> = [
  { to: "/ops", key: "nav.summary" },
  { to: "/ops/stations", key: "nav.stations" },
  { to: "/ops/fleet", key: "nav.fleet" },
  { to: "/ops/loans", key: "nav.loans" },
  { to: "/ops/redistribution", key: "nav.redistribution" },
  { to: "/ops/users", key: "nav.users" },
  { to: "/ops/settings", key: "nav.settings" },
];

function OpsLayout() {
  const { t } = useI18n();
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setAuthed(sessionStorage.getItem(OPS_SESSION_KEY) === "1");
    } catch {
      setAuthed(false);
    }
  }, []);
  if (authed === null) return null;
  if (!authed) return <OpsLogin onOk={() => setAuthed(true)} />;
  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <nav aria-label={t("ops.title")} className="-mx-4 flex flex-1 gap-1 overflow-x-auto px-4 pb-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-accent"
              activeProps={{ className: "!border-info !bg-info !text-info-foreground" }}
            >
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("ops.logout")}
          title={t("ops.logout")}
          onClick={() => {
            try {
              sessionStorage.removeItem(OPS_SESSION_KEY);
            } catch {
              /* ignore */
            }
            setAuthed(false);
          }}
        >
          <LogOut />
        </Button>
      </div>
      <DemoClockBanner />
      <Outlet />
    </div>
  );
}

function OpsLogin({ onOk }: { onOk: () => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (key !== OPS_ACCESS_KEY) return setErr(t("ops.keyWrong"));
    try {
      sessionStorage.setItem(OPS_SESSION_KEY, "1");
    } catch {
      /* session-only */
    }
    onOk();
  };
  return (
    <Card className="mx-auto mt-6 max-w-sm space-y-4">
      <div className="flex items-center gap-2">
        <LockKeyhole className="size-5 text-info" aria-hidden />
        <h1 className="text-xl font-extrabold">{t("ops.login")}</h1>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div>
          <label htmlFor="opskey" className="mb-1 block text-sm font-semibold">
            {t("ops.key")}
          </label>
          <input
            id="opskey"
            type="password"
            className={inputCls}
            value={key}
            aria-invalid={!!err}
            aria-describedby="opskey-err"
            onChange={(e) => {
              setKey(e.target.value);
              setErr(null);
            }}
          />
          <FieldError id="opskey-err">{err}</FieldError>
        </div>
        <Button type="submit" className="w-full">
          {t("ops.enter")}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        <strong>{t("ops.demoAccess")}</strong> · {t("ops.keyHelp")}
      </p>
    </Card>
  );
}
