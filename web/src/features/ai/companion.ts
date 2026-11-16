import { z } from "zod";
import { env } from "@/lib/supabase";
import type { MaterialKind } from "@/domain/taxonomy";
import { generateResponseSchema, type GenerateResponse } from "./generated";

/**
 * Client for the OPTIONAL teacher-local companion (FastAPI on 127.0.0.1).
 * Nothing here talks to Supabase: prompts and documents never leave the
 * teacher's computer. Every feature outside the AI panel works without it.
 */

const TOKEN_KEY = "flashclass.companion.token";

export function getPairingToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPairingToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export type CompanionState =
  | { state: "unreachable" }
  | { state: "unpaired"; version: string }
  | { state: "ollama_down"; version: string }
  | { state: "no_models"; version: string }
  | { state: "ready"; version: string; models: string[]; defaultModel: string | null };

const healthSchema = z.object({ status: z.literal("ok"), version: z.string() });
const modelsSchema = z.object({
  ollama_reachable: z.boolean(),
  models: z.array(z.string()),
  default_model: z.string().nullable(),
});

export class CompanionError extends Error {
  constructor(
    public readonly code: "unreachable" | "unauthorized" | "rejected" | "timeout" | "invalid_output" | "server_error",
    public readonly detail?: string,
  ) {
    super(code);
    this.name = "CompanionError";
  }
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const token = getPairingToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${env.VITE_COMPANION_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
      // Chrome Private Network Access: lets the page ask to reach a loopback address.
      targetAddressSpace: "local",
    } as RequestInit);
  } catch (error) {
    if (controller.signal.aborted) throw new CompanionError("timeout");
    throw new CompanionError("unreachable", String(error));
  } finally {
    clearTimeout(timer);
  }
}

export async function checkCompanion(): Promise<CompanionState> {
  let version: string;
  try {
    const res = await request("/health", {}, 3_000);
    if (!res.ok) return { state: "unreachable" };
    version = healthSchema.parse(await res.json()).version;
  } catch {
    return { state: "unreachable" };
  }
  if (!getPairingToken()) return { state: "unpaired", version };
  const res = await request("/v1/models", {}, 5_000);
  if (res.status === 401 || res.status === 403) return { state: "unpaired", version };
  if (!res.ok) return { state: "ollama_down", version };
  const models = modelsSchema.parse(await res.json());
  if (!models.ollama_reachable) return { state: "ollama_down", version };
  if (models.models.length === 0) return { state: "no_models", version };
  return { state: "ready", version, models: models.models, defaultModel: models.default_model };
}

export interface GenerateOptions {
  kind: MaterialKind;
  topic: string;
  language: string;
  levelHint: string;
  count: number;
  model: string;
  file?: File | null;
}

export async function generateWithCompanion(options: GenerateOptions): Promise<GenerateResponse> {
  const form = new FormData();
  form.append(
    "options",
    JSON.stringify({
      kind: options.kind,
      topic: options.topic,
      language: options.language,
      level_hint: options.levelHint,
      count: options.count,
      model: options.model,
    }),
  );
  if (options.file) form.append("file", options.file);

  // Local models can be slow; allow several minutes.
  const res = await request("/v1/generate", { method: "POST", body: form }, 300_000);
  if (res.status === 401 || res.status === 403) throw new CompanionError("unauthorized");
  if (res.status >= 400 && res.status < 500) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new CompanionError("rejected", typeof body.detail === "string" ? body.detail : undefined);
  }
  if (res.status === 502) throw new CompanionError("invalid_output");
  if (res.status === 504) throw new CompanionError("timeout");
  if (!res.ok) throw new CompanionError("server_error");

  const parsed = generateResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new CompanionError("invalid_output", parsed.error.message);
  return parsed.data;
}
