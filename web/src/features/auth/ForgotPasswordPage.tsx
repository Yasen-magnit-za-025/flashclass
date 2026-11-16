import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorBanner, Field, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setBusy(false);
    // Same message whether or not the account exists (no account enumeration).
    if (resetError && !/not found/i.test(resetError.message)) setError(toAppError(resetError));
    else setSent(true);
  };

  return (
    <div className="container auth-card">
      <h1>{t("auth.forgot.title")}</h1>
      {sent ? (
        <Notice tone="success">{t("auth.forgot.sent")}</Notice>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="stack">
          <p className="muted">{t("auth.forgot.body")}</p>
          <ErrorBanner error={error} />
          <Field label={t("auth.email")}>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" busy={busy}>
            {t("auth.forgot.submit")}
          </Button>
        </form>
      )}
      <p className="auth-links">
        <Link to="/auth/sign-in">{t("auth.sign_in.link")}</Link>
      </p>
    </div>
  );
}
