import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, ErrorBanner, Field } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export function SignInPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) setError(toAppError(signInError));
    // On success RedirectIfSignedIn navigates to ?next or home.
  };

  return (
    <div className="container auth-card">
      <h1>{t("auth.sign_in.title")}</h1>
      <form onSubmit={(e) => void submit(e)} className="stack">
        <ErrorBanner error={error} />
        <Field label={t("auth.email")}>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("auth.password")}>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" busy={busy}>
          {t("auth.sign_in.submit")}
        </Button>
      </form>
      <p className="auth-links">
        <Link to="/auth/forgot">{t("auth.forgot.link")}</Link>
        <span>
          {t("auth.sign_in.no_account")}{" "}
          <Link to={`/auth/sign-up${params.toString() ? `?${params.toString()}` : ""}`}>{t("auth.sign_up.link")}</Link>
        </span>
      </p>
    </div>
  );
}
