import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/app/session";
import { fromEditPayload, toSavePayload, type MaterialDraft } from "@/domain/materialDraft";
import type { LevelScheme } from "@/domain/taxonomy";
import { unwrap } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export const materialKeys = {
  mine: (userId: string | undefined) => ["materials", "mine", userId] as const,
  edit: (id: string) => ["materials", "edit", id] as const,
};

export function useMyMaterials() {
  const { user } = useSession();
  return useQuery({
    queryKey: materialKeys.mine(user?.id),
    enabled: Boolean(user),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("learning_materials")
          .select("id, kind, title, status, subject_code, updated_at, published_at, hidden_reason")
          .eq("owner_id", user!.id)
          .order("updated_at", { ascending: false }),
      ),
  });
}

export async function loadForEdit(id: string): Promise<MaterialDraft> {
  return fromEditPayload(unwrap(await supabase.rpc("get_material_for_edit", { p_id: id })));
}

/** Saves and returns the material id. */
export async function saveMaterial(draft: MaterialDraft, scheme: LevelScheme | undefined): Promise<string> {
  return unwrap(await supabase.rpc("save_material", { p_material: toSavePayload(draft, scheme) }));
}

export async function publishMaterial(id: string): Promise<void> {
  unwrap(await supabase.rpc("publish_material", { p_id: id, p_attest_all_ages: true }));
}

export async function unpublishMaterial(id: string): Promise<void> {
  unwrap(await supabase.rpc("unpublish_material", { p_id: id }));
}

export async function deleteMaterial(id: string): Promise<void> {
  const deleted = unwrap(await supabase.from("learning_materials").delete().eq("id", id).select("id"));
  if (deleted.length === 0) throw new Error("not_found");
}
