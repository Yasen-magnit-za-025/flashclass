import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "./errors";

describe("toAppError", () => {
  it("maps an unreachable auth server to the network message (regression: was 'Something went wrong')", () => {
    expect(toAppError(new AuthRetryableFetchError("Failed to fetch", 0)).key).toBe("errors.network");
  });

  it("maps PostgREST fetch failures to the network message", () => {
    expect(toAppError({ message: "TypeError: Failed to fetch", details: "", hint: "", code: "" }).key).toBe("errors.network");
  });

  it("uses Supabase auth error codes", () => {
    expect(toAppError(new AuthApiError("Invalid login credentials", 400, "invalid_credentials")).key).toBe(
      "errors.auth.invalid_credentials",
    );
    expect(toAppError(new AuthApiError("Email not confirmed", 400, "email_not_confirmed")).key).toBe(
      "errors.auth.email_not_confirmed",
    );
    expect(toAppError(new AuthApiError("slow down", 429, "over_request_rate_limit")).key).toBe("errors.rate_limited");
  });

  it("falls back to message text for servers without codes", () => {
    expect(toAppError(new AuthApiError("Invalid login credentials", 400, undefined)).key).toBe(
      "errors.auth.invalid_credentials",
    );
  });

  it("maps database function errors", () => {
    expect(toAppError({ message: "attestation_required", code: "22023" }).key).toBe("errors.db.attestation_required");
  });

  it("never leaks unknown technical messages", () => {
    const mapped = toAppError(new Error("relation \"secret_table\" does not exist"));
    expect(mapped.key).toBe("errors.generic");
    expect(mapped).toBeInstanceOf(AppError);
  });
});
