// Invite a teacher (admin only).
//
// Flow: verify caller JWT -> check CURRENT admin grant in the database ->
// Auth Admin invite (or detect existing account) -> grant teacher role through
// a service_role-only SQL function. The secret key never leaves this function.
//
// Request:  POST { "email": string }
// Response: 200 { "status": "invited" | "role_granted" }
//           4xx/5xx { "error": string }

import { createClient } from "jsr:@supabase/supabase-js@2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    console.error("invite-teacher: missing Supabase environment");
    return json({ error: "server_misconfigured" }, 500, origin);
  }

  // 1. Who is calling?
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "unauthorized" }, 401, origin);
  }
  const callerId = userData.user.id;

  // 2. Is the caller an admin RIGHT NOW? (JWT claims could be stale.)
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRow, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) {
    console.error("invite-teacher: role lookup failed", roleError.message);
    return json({ error: "server_error" }, 500, origin);
  }
  if (!roleRow) {
    return json({ error: "forbidden" }, 403, origin);
  }

  // 3. Validate input.
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "invalid_body" }, 400, origin);
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ error: "invalid_email" }, 400, origin);
  }

  // 4. Invite (new account) or detect an existing account.
  const redirectTo = Deno.env.get("INVITE_REDIRECT_URL") ?? undefined;
  let status: "invited" | "role_granted" = "invited";
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError) {
    const alreadyExists =
      inviteError.status === 422 || /already (been )?registered|already exists/i.test(inviteError.message);
    if (!alreadyExists) {
      console.error("invite-teacher: invite failed", inviteError.status, inviteError.message);
      return json({ error: "invite_failed" }, 502, origin);
    }
    status = "role_granted";
  }

  // 5. Grant teacher through the trusted path. Signup metadata is never trusted.
  const { error: grantError } = await admin.rpc("service_grant_role_by_email", {
    p_email: email,
    p_role: "teacher",
    p_granted_by: callerId,
  });
  if (grantError) {
    console.error("invite-teacher: grant failed", grantError.message);
    return json({ error: "grant_failed" }, 500, origin);
  }

  return json({ status }, 200, origin);
});
