import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { MessageKey } from "@/i18n/messages";

/** Error codes raised by our SQL functions (see supabase/migrations). */
const KNOWN_DB_ERRORS = [
  "forbidden",
  "not_authenticated",
  "not_found",
  "invalid_payload",
  "invalid_answer_key",
  "too_many_questions",
  "questions_not_allowed",
  "material_hidden",
  "invalid_status",
  "attestation_required",
  "empty_material",
  "suitability_mismatch",
  "suitability_required",
  "not_a_quiz",
  "already_submitted",
  "material_unavailable",
  "invalid_answers",
  "foreign_question",
  "duplicate_question",
  "cannot_remove_own_admin",
  "student_role_is_permanent",
] as const;

type KnownDbError = (typeof KNOWN_DB_ERRORS)[number];

export class AppError extends Error {
  constructor(
    public readonly key: MessageKey,
    public readonly detail?: string,
    options?: { cause?: unknown },
  ) {
    super(key, options);
    this.name = "AppError";
  }
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  status?: unknown;
}

/** Maps Supabase/Postgres/Auth/network errors to a translatable message key. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as ErrorLike;
  const message = typeof e.message === "string" ? e.message : "";
  const detail = typeof e.details === "string" ? e.details : undefined;

  if ((KNOWN_DB_ERRORS as readonly string[]).includes(message)) {
    return new AppError(`errors.db.${message as KnownDbError}`, detail, { cause: error });
  }
  if (e.code === "23514") return new AppError("errors.db.check_violation", detail, { cause: error });
  if (e.code === "23505") return new AppError("errors.db.duplicate", detail, { cause: error });
  if (e.code === "42501") return new AppError("errors.db.forbidden", detail, { cause: error });

  // Supabase Auth errors carry a stable machine-readable `code`; prefer it over message text.
  if (isAuthError(error)) {
    const key = error.code ? AUTH_ERROR_CODES[error.code] : undefined;
    if (key) return new AppError(key, undefined, { cause: error });
  }

  // Network failures. supabase-js wraps fetch errors in AuthRetryableFetchError
  // (auth) or returns { message: "TypeError: Failed to fetch" } (PostgREST) —
  // neither is a bare TypeError, which is why these used to fall through to
  // the generic "Something went wrong".
  if (
    isAuthRetryableFetchError(error) ||
    (error instanceof TypeError && /fetch|network|load failed/i.test(message)) ||
    /failed to fetch|networkerror|load failed|fetch failed/i.test(message)
  ) {
    return new AppError("errors.network", undefined, { cause: error });
  }

  // Fallbacks for older servers that don't send error codes.
  if (/invalid login credentials/i.test(message)) return new AppError("errors.auth.invalid_credentials");
  if (/email not confirmed/i.test(message)) return new AppError("errors.auth.email_not_confirmed");
  if (/already registered/i.test(message)) return new AppError("errors.auth.already_registered");
  if (/password should be/i.test(message)) return new AppError("errors.auth.weak_password");
  if (/rate limit/i.test(message) || e.status === 429) return new AppError("errors.rate_limited");

  if (import.meta.env.DEV) console.error(error);
  return new AppError("errors.generic", undefined, { cause: error });
}

const AUTH_ERROR_CODES: Partial<Record<string, MessageKey>> = {
  invalid_credentials: "errors.auth.invalid_credentials",
  email_not_confirmed: "errors.auth.email_not_confirmed",
  user_already_exists: "errors.auth.already_registered",
  email_exists: "errors.auth.already_registered",
  weak_password: "errors.auth.weak_password",
  same_password: "errors.auth.same_password",
  email_address_invalid: "errors.auth.invalid_email",
  validation_failed: "errors.auth.invalid_email",
  over_request_rate_limit: "errors.rate_limited",
  over_email_send_rate_limit: "errors.rate_limited",
  signup_disabled: "errors.auth.signup_disabled",
  user_banned: "errors.auth.user_banned",
  session_expired: "errors.auth.session_expired",
  session_not_found: "errors.auth.session_expired",
  refresh_token_not_found: "errors.auth.session_expired",
  otp_expired: "errors.auth.link_expired",
  flow_state_expired: "errors.auth.link_expired",
  flow_state_not_found: "errors.auth.link_expired",
  bad_code_verifier: "errors.auth.link_other_browser",
  request_timeout: "errors.network",
};

/** Throws a mapped AppError if a Supabase response carries an error. */
type SuccessData<R> = R extends { error: null; data: infer D } ? D : never;

export function unwrap<R extends { data: unknown; error: unknown }>(result: R): SuccessData<R> {
  if (result.error) throw toAppError(result.error);
  return result.data as SuccessData<R>;
}

/** Parses "question:3" detail strings from the database into a question index. */
export function questionIndexFromDetail(detail: string | undefined): number | null {
  const match = detail?.match(/^question:(\d+)$/);
  return match?.[1] ? Number(match[1]) : null;
}
