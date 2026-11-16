import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppRole } from "@/domain/taxonomy";
import { unwrap } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;

interface SessionContextValue {
  status: "loading" | "signedOut" | "signedIn";
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: ReadonlySet<AppRole>;
  isTeacher: boolean;
  isAdmin: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const meQueryKey = (userId: string | undefined) => ["me", userId] as const;

async function fetchMe(userId: string) {
  const [profile, roles] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return {
    profile: unwrap(profile),
    roles: new Set(unwrap(roles).map((r) => r.role)) as ReadonlySet<AppRole>,
  };
}

/**
 * Tracks the Auth session and loads the caller's profile and CURRENT role grants
 * from the database (not JWT claims). Roles here only shape navigation; RLS is
 * the security boundary.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setAuthReady(true);
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id;
  const me = useQuery({
    queryKey: meQueryKey(userId),
    queryFn: () => fetchMe(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const value = useMemo<SessionContextValue>(() => {
    const roles = me.data?.roles ?? new Set<AppRole>();
    const status = !authReady || (userId && me.isPending) ? "loading" : session ? "signedIn" : "signedOut";
    return {
      status,
      session,
      user: session?.user ?? null,
      profile: me.data?.profile ?? null,
      roles,
      isTeacher: roles.has("teacher"),
      isAdmin: roles.has("admin"),
    };
  }, [authReady, me.data, me.isPending, session, userId]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
