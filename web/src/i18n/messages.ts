import { bg } from "./bg";
import { en } from "./en";
import type { UiLocale } from "@/domain/taxonomy";

/** English is the reference catalog: every key must exist in every locale (enforced by type). */
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

/** Keys that have `.one` / `.other` plural variants. */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer Base}.other` ? Base : never) : never;

export const catalogs: Record<UiLocale, Messages> = { en, bg };

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
