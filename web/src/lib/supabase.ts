import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseEnv } from "./env";

export const env = parseEnv(import.meta.env);

/**
 * Browser client: publishable key + the signed-in user's JWT. Every request is
 * authorized by Postgres grants and RLS; nothing here is trusted for security.
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
