import type { MessageKey } from "@/i18n/messages";

export const MIN_PASSWORD_LENGTH = 8;

// Pragmatic check: one "@", something before it, a dot in the domain, no spaces.
// The auth server remains the authority; this only catches typos early.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): MessageKey | null {
  const email = value.trim();
  if (!email) return "auth.validation.email_required";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "auth.validation.email_invalid";
  return null;
}

/** Sign-in: only presence is checked; length rules belong to sign-up/reset. */
export function validateSignInPassword(value: string): MessageKey | null {
  return value ? null : "auth.validation.password_required";
}

export function validateNewPassword(value: string): MessageKey | null {
  if (!value) return "auth.validation.password_required";
  if (value.length < MIN_PASSWORD_LENGTH) return "auth.password.too_short";
  return null;
}

/** Only allows same-origin relative paths as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/auth/")) {
    return "/";
  }
  return next;
}
