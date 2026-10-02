import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/mobility/store";
import { findUserByCredential } from "@/lib/mobility/rules";
import { Button } from "@/components/ui/button";
import { Card, FieldError, inputCls } from "./ui";

/** Simulated identification by credential (no real authentication). */
export function Identify() {
  const { t } = useI18n();
  const { state, setSessionCredential } = useStore();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const submit = () => {
    if (!value.trim()) return setError(t("err.required"));
    const u = findUserByCredential(state, value);
    if (!u) return setError(t("err.credential_not_found"));
    setSessionCredential(u.credential);
  };
  return (
    <Card className="mx-auto max-w-md space-y-3">
      <p>{t("loan.identify")}</p>
      <div>
        <label htmlFor="id-cred" className="mb-1 block text-sm font-semibold">
          {t("checkout.credential")}
        </label>
        <input
          id="id-cred"
          className={inputCls}
          value={value}
          placeholder="CDS-1001"
          aria-invalid={!!error}
          aria-describedby="id-err"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <FieldError id="id-err">{error}</FieldError>
        <p className="mt-1 text-xs text-muted-foreground">{t("checkout.credentialHelp")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {state.users.slice(0, 6).map((u) => (
          <Button key={u.id} variant="outline" size="sm" onClick={() => setSessionCredential(u.credential)}>
            {u.credential} · {u.name.split(" ")[0]}
          </Button>
        ))}
      </div>
      <Button className="w-full" onClick={submit}>
        {t("loan.identifyBtn")}
      </Button>
    </Card>
  );
}
