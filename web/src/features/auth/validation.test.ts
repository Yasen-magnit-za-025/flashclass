import { describe, expect, it } from "vitest";
import { safeNextPath, validateEmail, validateNewPassword, validateSignInPassword } from "./validation";

describe("auth validation", () => {
  it("requires an email", () => {
    expect(validateEmail("   ")).toBe("auth.validation.email_required");
  });

  it.each(["plainaddress", "a@b", "a b@c.com", "@example.com", "user@.c"])("rejects %s", (email) => {
    expect(validateEmail(email)).toBe("auth.validation.email_invalid");
  });

  it.each(["student@flashclass.test", " ivan.petrov@uni-sofia.bg ", "x+tag@mail.example.com"])("accepts %s", (email) => {
    expect(validateEmail(email)).toBeNull();
  });

  it("sign-in only requires a password to be present", () => {
    expect(validateSignInPassword("")).toBe("auth.validation.password_required");
    expect(validateSignInPassword("short")).toBeNull();
  });

  it("new passwords need the minimum length", () => {
    expect(validateNewPassword("1234567")).toBe("auth.password.too_short");
    expect(validateNewPassword("12345678")).toBeNull();
  });
});

describe("safeNextPath", () => {
  it.each([
    [null, "/"],
    ["/teach", "/teach"],
    ["/m/abc?x=1", "/m/abc?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/auth/sign-in", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
