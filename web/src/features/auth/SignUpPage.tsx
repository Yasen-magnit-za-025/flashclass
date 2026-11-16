import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorBanner, Field, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD = 8;

/**
 * Open signup always creates a STUDENT account. Roles are granted only by the
 * database (default student) or an admin; nothing sent here can change that.
 */
export function SignUpPage() {
  const { t, locale } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD || !acceptedPrivacy) return;
    setBusy(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { display_name: displayName.trim(), ui_locale: locale },
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(toAppError(signUpError));
      return;
    }
    // With email confirmation enabled there is no session yet.
    if (!data.session) setSentTo(email.trim());
  };

  if (sentTo) {
    return (
      <div className="container auth-card">
        <h1>{t("auth.sign_up.check_email.title")}</h1>
        <Notice tone="success">{t("auth.sign_up.check_email.body", { email: sentTo })}</Notice>
        <Link to="/auth/sign-in">{t("auth.sign_in.link")}</Link>
      </div>
    );
  }

  return (
    <div className="container auth-card">
      <h1>{t("auth.sign_up.title")}</h1>
      <p className="muted">{t("auth.sign_up.subtitle")}</p>
      <form onSubmit={(e) => void submit(e)} className="stack">
        <ErrorBanner error={error} />
        <Field label={t("profile.display_name")} hint={t("profile.display_name.hint")}>
          <input required maxLength={60} autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t("auth.email")}>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field
          label={t("auth.password")}
          hint={t("auth.password.hint", { min: MIN_PASSWORD })}
          error={passwordTooShort ? t("auth.password.too_short", { min: MIN_PASSWORD }) : undefined}
        >
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <label className="checkbox">
          <input type="checkbox" required checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} />
          <span>
            {t("auth.sign_up.privacy_prefix")} <Link to="/privacy">{t("nav.privacy")}</Link>
          </span>
        </label>
        <Button type="submit" variant="primary" busy={busy} disabled={!acceptedPrivacy}>
          {t("auth.sign_up.submit")}
        </Button>
      </form>
      <p className="auth-links">
        <span>
          {t("auth.sign_up.have_account")} <Link to="/auth/sign-in">{t("auth.sign_in.link")}</Link>
        </span>
      </p>
    </div>
  );
}
