import { z } from "zod";

/** True if a key would grant privileged access and must never ship to a browser. */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20)
    .refine((k) => !isPrivilegedKey(k), "A secret/service_role key must never be used in the frontend."),
  VITE_COMPANION_URL: z.string().url().default("http://127.0.0.1:8765"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid frontend environment (${problems}). Copy web/.env.example to web/.env.local.`);
  }
  return parsed.data;
}
