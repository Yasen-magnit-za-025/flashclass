import { useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Field } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { AppError, toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { AuthErrorAlert, AuthLayout, AuthLink, FormAlert, PasswordField } from "./components";
import { validateEmail, validateSignInPassword } from "./validation";

type Status = "idle" | "submitting" | "success";

export function SignInPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const emailError = validateEmail(email);
  const passwordError = validateSignInPassword(password);
  const showEmailError = (touched.email || submitted) && emailError;
  const showPasswordError = (touched.password || submitted) && passwordError;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return; // guards Enter-key double submits too
    setSubmitted(true);
    setError(null);
    if (emailError) return emailRef.current?.focus();
    if (passwordError) return passwordRef.current?.focus();

    setStatus("submitting");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      const mapped = toAppError(signInError);
      setError(mapped);
      setAttempt((n) => n + 1);
      setStatus("idle");
      if (mapped.key === "errors.auth.invalid_credentials") {
        setPassword("");
        setTouched((tch) => ({ ...tch, password: false }));
        setSubmitted(false);
      }
      return;
    }
    // RedirectIfSignedIn takes over once the session and roles are loaded.
    setStatus("success");
  };

  const next = params.get("next");
  const signUpHref = `/auth/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <AuthLayout
      title={t("auth.sign_in.title")}
      subtitle={t("auth.sign_in.subtitle")}
      footer={
        <p>
          {t("auth.sign_in.no_account")} <AuthLink to={signUpHref}>{t("auth.sign_up.link")}</AuthLink>
        </p>
      }
    >
      <form className="auth-form" noValidate onSubmit={(e) => void submit(e)} aria-busy={status === "submitting"}>
        {params.get("signedOut") && !error && status === "idle" && <FormAlert tone="info">{t("auth.signed_out")}</FormAlert>}
        {params.get("expired") && !error && status === "idle" && <FormAlert tone="info">{t("errors.auth.session_expired")}</FormAlert>}
        {status === "success" && <FormAlert tone="success">{t("auth.sign_in.success")}</FormAlert>}
        <AuthErrorAlert error={error} focusKey={attempt} />

        <Field label={t("auth.email")} error={showEmailError ? t(emailError) : undefined}>
          <input
            ref={emailRef}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            disabled={status !== "idle"}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((tch) => ({ ...tch, email: true }))}
          />
        </Field>

        <div className="field-with-action">
          <Field label={t("auth.password")} error={showPasswordError ? t(passwordError) : undefined}>
            <PasswordField
              ref={passwordRef}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={status !== "idle"}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((tch) => ({ ...tch, password: true }))}
            />
          </Field>
          <AuthLink to="/auth/forgot">{t("auth.forgot.link")}</AuthLink>
        </div>

        <Button type="submit" variant="primary" className="btn-block btn-lg" busy={status === "submitting"} disabled={status === "success"}>
          {status === "submitting" ? t("auth.sign_in.submitting") : t("auth.sign_in.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
