import { useRef, useState, type FormEvent } from "react";
import { Button, Field } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { AppError, toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { AuthErrorAlert, AuthLayout, AuthLink, FormAlert } from "./components";
import { validateEmail } from "./validation";

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const emailError = validateEmail(email);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setError(null);
    if (emailError) return emailRef.current?.focus();
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setBusy(false);
    if (resetError) {
      const mapped = toAppError(resetError);
      // Never reveal whether an account exists: only surface errors the user can act on.
      if (mapped.key === "errors.network" || mapped.key === "errors.rate_limited" || mapped.key === "errors.auth.invalid_email") {
        setError(mapped);
        setAttempt((n) => n + 1);
        return;
      }
    }
    setSent(true);
  };

  return (
    <AuthLayout
      title={t("auth.forgot.title")}
      subtitle={sent ? undefined : t("auth.forgot.body")}
      footer={<AuthLink to="/auth/sign-in">{t("auth.back_to_sign_in")}</AuthLink>}
    >
      {sent ? (
        <FormAlert tone="success">{t("auth.forgot.sent")}</FormAlert>
      ) : (
        <form className="auth-form" noValidate onSubmit={(e) => void submit(e)} aria-busy={busy}>
          <AuthErrorAlert error={error} focusKey={attempt} />
          <Field label={t("auth.email")} error={(touched || submitted) && emailError ? t(emailError) : undefined}>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
            />
          </Field>
          <Button type="submit" variant="primary" className="btn-block btn-lg" busy={busy}>
            {t("auth.forgot.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
