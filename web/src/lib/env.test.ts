import { describe, expect, it } from "vitest";
import { isPrivilegedKey, parseEnv } from "./env";

const jwt = (payload: object) => `xxx.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.sig`;

describe("frontend key guard", () => {
  it("rejects secret and service_role keys", () => {
    expect(isPrivilegedKey("sb_secret_abc123")).toBe(true);
    expect(isPrivilegedKey(jwt({ role: "service_role" }))).toBe(true);
  });

  it("accepts publishable and anon keys", () => {
    expect(isPrivilegedKey("sb_publishable_abc123")).toBe(false);
    expect(isPrivilegedKey(jwt({ role: "anon" }))).toBe(false);
  });

  it("refuses to start with a privileged key", () => {
    expect(() =>
      parseEnv({ VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "service_role", pad: "x".repeat(20) }) }),
    ).toThrow(/secret/);
  });
});
