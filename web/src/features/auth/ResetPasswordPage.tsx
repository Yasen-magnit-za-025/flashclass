import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/app/session";
import { Button, Field, PageLoader } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { AppError, toAppError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { AuthErrorAlert, AuthLayout, AuthLink, FormAlert, PasswordField } from "./components";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "./validation";

/**
 * Target of the recovery/invitation email and of "change password" in the
 * profile. The Supabase client exchanges the code in the URL for a session first.
 */
export function ResetPasswordPage() {
  const { t } = useI18n();
  const { status } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  if (status === "loading") return <PageLoader />;
  if (status === "signedOut") {
    return (
      <AuthLayout title={t("auth.reset.title")} footer={<AuthLink to="/auth/forgot">{t("auth.forgot.request_new")}</AuthLink>}>
        <FormAlert tone="error">{t("auth.reset.link_invalid")}</FormAlert>
      </AuthLayout>
    );
  }

  const passwordError = validateNewPassword(password);
  const confirmError = !confirm ? "auth.validation.password_required" : confirm !== password ? "auth.password.mismatch" : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setError(null);
    if (passwordError) return passwordRef.current?.focus();
    if (confirmError) return confirmRef.current?.focus();
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(toAppError(updateError));
      setAttempt((n) => n + 1);
    } else {
      navigate("/profile?passwordChanged=1", { replace: true });
    }
  };

  return (
    <AuthLayout title={t("auth.reset.title")}>
      <form className="auth-form" noValidate onSubmit={(e) => void submit(e)} aria-busy={busy}>
        <AuthErrorAlert error={error} focusKey={attempt} />
        <Field
          label={t("auth.new_password")}
          hint={t("auth.password.hint", { min: MIN_PASSWORD_LENGTH })}
          error={(touched.password || submitted) && passwordError ? t(passwordError, { min: MIN_PASSWORD_LENGTH }) : undefined}
        >
          <PasswordField
            ref={passwordRef}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((x) => ({ ...x, password: true }))}
          />
        </Field>
        <Field
          label={t("auth.confirm_password")}
          error={(touched.confirm || submitted) && confirmError ? t(confirmError) : undefined}
        >
          <PasswordField
            ref={confirmRef}
            autoComplete="new-password"
            required
            value={confirm}
            disabled={busy}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setTouched((x) => ({ ...x, confirm: true }))}
          />
        </Field>
        <Button type="submit" variant="primary" className="btn-block btn-lg" busy={busy}>
          {t("auth.reset.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
