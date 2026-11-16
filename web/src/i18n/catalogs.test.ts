import { describe, expect, it } from "vitest";
import { bg } from "./bg";
import { en } from "./en";
import { interpolate } from "./messages";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("message catalogs", () => {
  it("Bulgarian has no empty strings", () => {
    expect(Object.entries(bg).filter(([, v]) => !v.trim())).toEqual([]);
  });

  it("Bulgarian uses the same placeholders as English", () => {
    const mismatched = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => placeholders(en[key]).join() !== placeholders(bg[key]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it("every plural key has both forms", () => {
    const keys = Object.keys(en);
    const bases = keys.filter((k) => k.endsWith(".one")).map((k) => k.slice(0, -4));
    for (const base of bases) expect(keys).toContain(`${base}.other`);
  });

  it("interpolates and leaves unknown placeholders intact", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});
