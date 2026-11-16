import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircleIcon, BookOpenIcon, CheckCircleIcon, EyeIcon, EyeOffIcon, LayersIcon, ShieldCheckIcon } from "@/components/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { AppError, toAppError } from "@/lib/errors";

/**
 * Two-panel auth layout: brand/value panel (desktop only) + form card.
 * Collapses to a single centered card on tablet and mobile.
 */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  const features = [
    { icon: <LayersIcon />, text: t("auth.aside.feature_kinds") },
    { icon: <BookOpenIcon />, text: t("auth.aside.feature_library") },
    { icon: <ShieldCheckIcon />, text: t("auth.aside.feature_privacy") },
  ];
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <p className="auth-aside-eyebrow">FlashClass</p>
          <p className="auth-aside-title">{t("auth.aside.title")}</p>
          <ul className="auth-aside-list">
            {features.map((f) => (
              <li key={f.text}>
                <span className="auth-aside-icon">{f.icon}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <div className="auth-panel">
        <div className="auth-card">
          <header className="auth-card-header">
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </header>
          {children}
          {footer && <div className="auth-card-footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Form-level message. Receives focus when it appears/changes so keyboard and
 * screen-reader users land on it after a failed submit.
 */
export function FormAlert({ tone, children, focusKey }: { tone: "error" | "success" | "info"; children: ReactNode; focusKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusKey !== undefined && tone === "error") ref.current?.focus();
  }, [focusKey, tone]);
  const Icon = tone === "success" ? CheckCircleIcon : AlertCircleIcon;
  return (
    <div ref={ref} tabIndex={-1} role={tone === "error" ? "alert" : "status"} className={`form-alert form-alert-${tone}`}>
      <Icon className="form-alert-icon" />
      <div>{children}</div>
    </div>
  );
}

/** Maps any error to a friendly message; in dev, adds a setup hint for network errors. */
export function AuthErrorAlert({ error, focusKey }: { error: unknown; focusKey?: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const appError = error instanceof AppError ? error : toAppError(error);
  return (
    <FormAlert tone="error" focusKey={focusKey}>
      <p>{t(appError.key)}</p>
      {import.meta.env.DEV && appError.key === "errors.network" && <p className="small">{t("errors.network.dev_hint")}</p>}
    </FormAlert>
  );
}

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { value: string };

/** Password input with show/hide toggle and Caps Lock warning. Paste and password managers stay enabled. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { id, onKeyUp, onKeyDown, onBlur, ...inputProps },
  ref,
) {
  const { t } = useI18n();
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const capsId = `${inputId}-caps`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const describedBy = [inputProps["aria-describedby"], capsLock ? capsId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="password-field">
      <div className="password-field-control">
        <input
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          spellCheck={false}
          autoCapitalize="none"
          {...inputProps}
          aria-describedby={describedBy}
          onKeyDown={(e) => {
            setCapsLock(e.getModifierState?.("CapsLock") ?? false);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            setCapsLock(e.getModifierState?.("CapsLock") ?? false);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
        />
        <button
          type="button"
          className="password-toggle"
          aria-controls={inputId}
          aria-pressed={visible}
          aria-label={visible ? t("auth.password.hide") : t("auth.password.show")}
          title={visible ? t("auth.password.hide") : t("auth.password.show")}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {capsLock && (
        <p id={capsId} className="caps-lock-hint" role="status">
          {t("auth.caps_lock")}
        </p>
      )}
    </div>
  );
});

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="auth-link">
      {children}
    </Link>
  );
}
