import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Field } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { AppError, toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { AuthErrorAlert, AuthLayout, AuthLink, FormAlert, PasswordField } from "./components";
import { MIN_PASSWORD_LENGTH, validateEmail, validateNewPassword } from "./validation";

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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    privacy: useRef<HTMLInputElement>(null),
  };

  const errors = {
    name: displayName.trim() ? null : ("auth.validation.name_required" as const),
    email: validateEmail(email),
    password: validateNewPassword(password),
    privacy: acceptedPrivacy ? null : ("auth.validation.privacy_required" as const),
  };
  const show = (field: keyof typeof errors) =>
    (touched[field] || submitted) && errors[field] ? t(errors[field]!, { min: MIN_PASSWORD_LENGTH }) : undefined;
  const touch = (field: string) => () => setTouched((x) => ({ ...x, [field]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setError(null);
    const firstInvalid = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k]);
    if (firstInvalid) return refs[firstInvalid].current?.focus();

    setBusy(true);
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
      setAttempt((n) => n + 1);
      return;
    }
    // With email confirmation enabled there is no session yet; otherwise the guard redirects.
    if (!data.session) setSentTo(email.trim());
  };

  if (sentTo) {
    return (
      <AuthLayout title={t("auth.sign_up.check_email.title")}>
        <FormAlert tone="success">{t("auth.sign_up.check_email.body", { email: sentTo })}</FormAlert>
        <p className="muted small">{t("auth.sign_up.check_email.hint")}</p>
        <AuthLink to="/auth/sign-in">{t("auth.back_to_sign_in")}</AuthLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.sign_up.title")}
      subtitle={t("auth.sign_up.subtitle")}
      footer={
        <p>
          {t("auth.sign_up.have_account")} <AuthLink to="/auth/sign-in">{t("auth.sign_in.link")}</AuthLink>
        </p>
      }
    >
      <form className="auth-form" noValidate onSubmit={(e) => void submit(e)} aria-busy={busy}>
        <AuthErrorAlert error={error} focusKey={attempt} />
        <Field label={t("profile.display_name")} hint={t("profile.display_name.hint")} error={show("name")}>
          <input
            ref={refs.name}
            required
            maxLength={60}
            autoComplete="nickname"
            value={displayName}
            disabled={busy}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={touch("name")}
          />
        </Field>
        <Field label={t("auth.email")} error={show("email")}>
          <input
            ref={refs.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={touch("email")}
          />
        </Field>
        <Field label={t("auth.password")} hint={t("auth.password.hint", { min: MIN_PASSWORD_LENGTH })} error={show("password")}>
          <PasswordField
            ref={refs.password}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={touch("password")}
          />
        </Field>
        <div className="field">
          <label className="checkbox">
            <input
              ref={refs.privacy}
              type="checkbox"
              required
              checked={acceptedPrivacy}
              disabled={busy}
              aria-invalid={show("privacy") ? true : undefined}
              aria-describedby={show("privacy") ? "privacy-error" : undefined}
              onChange={(e) => {
                setAcceptedPrivacy(e.target.checked);
                touch("privacy")();
              }}
            />
            <span>
              {t("auth.sign_up.privacy_prefix")} <Link to="/privacy">{t("nav.privacy")}</Link>
            </span>
          </label>
          {show("privacy") && (
            <p id="privacy-error" className="field-error" role="alert">
              {show("privacy")}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary" className="btn-block btn-lg" busy={busy}>
          {busy ? t("auth.sign_up.submitting") : t("auth.sign_up.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
