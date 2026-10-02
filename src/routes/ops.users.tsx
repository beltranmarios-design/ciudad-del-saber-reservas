import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import { activeLoanOf, addOrganization, addUser, setUserActive } from "@/lib/mobility/rules";
import { Card, FieldError, PageHeader, Pill, Select, inputCls, useErrorText } from "@/components/mobility/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ops/users")({
  head: () => ({
    meta: [
      { title: "Usuarios — Movilidad del campus" },
      { name: "description", content: "Gestión local de usuarios, credenciales y organizaciones residentes." },
      { property: "og:title", content: "Usuarios — Movilidad del campus" },
      { property: "og:description", content: "Usuarios y organizaciones del servicio de movilidad." },
    ],
  }),
  component: Users,
});

function Users() {
  const { t } = useI18n();
  const { state, run } = useStore();
  const errText = useErrorText();
  const [name, setName] = useState("");
  const [cred, setCred] = useState("");
  const [orgId, setOrgId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgErr, setOrgErr] = useState<string | null>(null);
  if (!state) return null;
  const org = (id: string) => state.organizations.find((o) => o.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader title={t("users.title")} subtitle={t("users.count", { n: state.users.length })} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-0">
          <ul className="divide-y">
            {state.users.map((u) => {
              const loan = activeLoanOf(state, u.id);
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.credential} · {org(u.orgId)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {loan && <Pill tone="info">{t("users.hasLoan")}</Pill>}
                    <Pill tone={u.active ? "ok" : "muted"}>{t(u.active ? "status.active" : "status.inactive")}</Pill>
                    <Button size="sm" variant="outline" onClick={() => run((s) => setUserActive(s, u.id, !u.active))}>
                      {t(u.active ? "users.deactivate" : "users.activate")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">{t("users.add")}</h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const r = run((s) => addUser(s, { name, credential: cred, orgId }, Date.now()));
                if (r.ok) {
                  setName(""); setCred(""); setErr(null);
                  toast.success(t("users.added"));
                } else setErr(errText(r.error));
              }}
            >
              <div>
                <label htmlFor="un" className="mb-1 block text-sm font-semibold">{t("users.name")}</label>
                <input id="un" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="uc" className="mb-1 block text-sm font-semibold">{t("users.credential")}</label>
                <input id="uc" className={inputCls} value={cred} placeholder="CDS-2001" onChange={(e) => setCred(e.target.value.toUpperCase())} />
              </div>
              <Select id="uo" label={t("common.organization")} value={orgId} onChange={setOrgId}>
                <option value="">—</option>
                {state.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <FieldError>{err}</FieldError>
              <Button type="submit" className="w-full">{t("users.add")}</Button>
            </form>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">{t("users.orgs")}</h2>
            <ul className="mb-3 space-y-1 text-sm">
              {state.organizations.map((o) => <li key={o.id}>{o.name}</li>)}
            </ul>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const r = run((s) => addOrganization(s, orgName, Date.now()));
                if (r.ok) { setOrgName(""); setOrgErr(null); toast.success(t("users.orgAdded")); }
                else setOrgErr(errText(r.error));
              }}
            >
              <label htmlFor="on" className="block text-sm font-semibold">{t("users.orgName")}</label>
              <input id="on" className={inputCls} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              <FieldError>{orgErr}</FieldError>
              <Button type="submit" variant="outline" className="w-full">{t("users.addOrg")}</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
