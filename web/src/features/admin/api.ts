import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppRole } from "@/domain/taxonomy";
import { libraryKeys } from "@/features/library/api";
import { AppError, toAppError, unwrap } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export function useReports(status: Enums<"report_status">) {
  return useQuery({
    queryKey: ["admin", "reports", status],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("material_reports")
          .select("id, reason, details, status, created_at, resolution_note, material:learning_materials(id, title, status, kind)")
          .eq("status", status)
          .order("created_at", { ascending: status === "open" })
          .limit(100),
      ),
  });
}

export function useHiddenMaterials() {
  return useQuery({
    queryKey: ["admin", "hidden"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("learning_materials")
          .select("id, title, kind, hidden_at, hidden_reason")
          .eq("status", "hidden")
          .order("hidden_at", { ascending: false }),
      ),
  });
}

export function useUsers(search: string) {
  return useQuery({
    queryKey: ["admin", "users", search],
    queryFn: async () => unwrap(await supabase.rpc("admin_list_users", { p_search: search || null, p_limit: 50 })),
    placeholderData: (previous) => previous,
  });
}

function useAdminMutation<TInput>(fn: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useResolveReport() {
  return useAdminMutation(async (input: { id: string; status: "resolved" | "dismissed"; note: string }) => {
    unwrap(await supabase.from("material_reports").update({ status: input.status, resolution_note: input.note }).eq("id", input.id));
  });
}

export function useModerate() {
  return useAdminMutation(async (input: { materialId: string; action: "hide" | "restore"; reason?: string }) => {
    unwrap(await supabase.rpc("moderate_material", { p_id: input.materialId, p_action: input.action, p_reason: input.reason ?? "" }));
  });
}

export function useSetRole() {
  return useAdminMutation(async (input: { userId: string; role: AppRole; enabled: boolean }) => {
    unwrap(await supabase.rpc("admin_set_role", { p_user_id: input.userId, p_role: input.role, p_enabled: input.enabled }));
  });
}

export function useInviteTeacher() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke<{ status: "invited" | "role_granted" }>("invite-teacher", {
        body: { email },
      });
      if (error) {
        // FunctionsHttpError carries the JSON body in `context`.
        const body = (await (error as { context?: Response }).context?.json?.().catch(() => null)) as { error?: string } | null;
        if (body?.error === "invalid_email") throw new AppError("admin.invite.invalid_email");
        if (body?.error === "forbidden") throw new AppError("errors.db.forbidden");
        throw toAppError(error);
      }
      return data!.status;
    },
  });
}
