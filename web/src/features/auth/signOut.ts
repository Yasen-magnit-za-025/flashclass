import { supabase } from "@/lib/supabase";

/**
 * Signs out everywhere when possible. If the server can't be reached,
 * supabase-js keeps the local session on error, so fall back to clearing it
 * locally: the user must never stay signed in after pressing "Sign out".
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: "local" });
}
