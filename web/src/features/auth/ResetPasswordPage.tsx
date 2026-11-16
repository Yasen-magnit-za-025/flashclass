import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/app/session";
import { Button, ErrorBanner, Field, Notice, PageLoader } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

/**
 * Target of the recovery email (and of "change password" in the profile).
 * The Supabase client exchanges the code in the URL for a session first.
 */
export function ResetPasswordPage() {
  const { t } = useI18n();
  const { status } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (status === "loading") return <PageLoader />;
  if (status === "signedOut") {
    return (
      <div className="container auth-card">
        <h1>{t("auth.reset.title")}</h1>
        <Notice tone="warning">{t("auth.reset.link_invalid")}</Notice>
        <Link to="/auth/forgot">{t("auth.forgot.link")}</Link>
      </div>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch || password.length < 8) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(toAppError(updateError));
    else navigate("/profile?passwordChanged=1", { replace: true });
  };

  return (
    <div className="container auth-card">
      <h1>{t("auth.reset.title")}</h1>
      <form onSubmit={(e) => void submit(e)} className="stack">
        <ErrorBanner error={error} />
        <Field label={t("auth.new_password")} hint={t("auth.password.hint", { min: 8 })}>
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t("auth.confirm_password")} error={mismatch ? t("auth.password.mismatch") : undefined}>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" busy={busy}>
          {t("auth.reset.submit")}
        </Button>
      </form>
    </div>
  );
}
