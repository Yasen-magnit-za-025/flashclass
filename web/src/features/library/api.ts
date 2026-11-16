import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/app/session";
import type { CefrLevel, DifficultyLevel, MaterialKind, ReportReason, Subject } from "@/domain/taxonomy";
import { useI18n } from "@/i18n/I18nProvider";
import { unwrap } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type LibraryItem = Database["public"]["Functions"]["search_library"]["Returns"][number];

export interface LibraryFilters {
  query?: string;
  subject?: string;
  kind?: MaterialKind;
  schoolGrade?: number;
  cefrLevel?: CefrLevel;
  difficulty?: DifficultyLevel;
  language?: string;
  savedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export const libraryKeys = {
  all: ["library"] as const,
  search: (f: LibraryFilters) => ["library", "search", f] as const,
  material: (id: string) => ["library", "material", id] as const,
};

// ---------------------------------------------------------------- subjects

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: async () => unwrap(await supabase.from("subjects").select("*").order("sort_order")),
    staleTime: Infinity,
  });
}

export function useSubjectName() {
  const { locale } = useI18n();
  const subjects = useSubjects();
  return (code: string) => {
    const s = subjects.data?.find((x) => x.code === code);
    return s ? (locale === "bg" ? s.name_bg : s.name_en) : code;
  };
}

export function findSubject(subjects: Subject[] | null | undefined, code: string | null | undefined) {
  return subjects?.find((s) => s.code === code);
}

// ---------------------------------------------------------------- search

export function useLibrarySearch(filters: LibraryFilters) {
  return useQuery({
    queryKey: libraryKeys.search(filters),
    queryFn: async () =>
      unwrap(
        await supabase.rpc("search_library", {
          p_query: filters.query || null,
          p_subject: filters.subject || null,
          p_kind: filters.kind ?? null,
          p_school_grade: filters.schoolGrade ?? null,
          p_cefr_level: filters.cefrLevel ?? null,
          p_difficulty: filters.difficulty ?? null,
          p_language: filters.language || null,
          p_saved_only: filters.savedOnly ?? false,
          p_limit: filters.limit ?? 24,
          p_offset: filters.offset ?? 0,
        }),
      ),
    placeholderData: (previous) => previous,
  });
}

// ---------------------------------------------------------------- one material

export function useMaterial(id: string | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: libraryKeys.material(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => {
      const material = unwrap(
        await supabase
          .from("learning_materials")
          .select(
            "id, owner_id, kind, title, description, language, subject_code, school_grade, cefr_level, difficulty_level, status, content, show_answers_after_submit, published_at, updated_at",
          )
          .eq("id", id!)
          .maybeSingle(),
      );
      if (!material) return null;
      const [author, saved, questionCount] = await Promise.all([
        supabase.from("teacher_directory").select("display_name").eq("user_id", material.owner_id).maybeSingle(),
        supabase.from("saved_materials").select("material_id").eq("material_id", material.id).eq("user_id", user!.id).maybeSingle(),
        supabase.from("material_questions").select("id", { count: "exact", head: true }).eq("material_id", material.id),
      ]);
      return {
        ...material,
        authorName: unwrap(author)?.display_name ?? null,
        isSaved: Boolean(unwrap(saved)),
        questionCount: questionCount.count ?? 0,
      };
    },
  });
}

export type MaterialDetail = NonNullable<ReturnType<typeof useMaterial>["data"]>;

// ---------------------------------------------------------------- bookmarks & reports

export function useToggleSaved() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async ({ materialId, save }: { materialId: string; save: boolean }) => {
      if (save) unwrap(await supabase.from("saved_materials").insert({ material_id: materialId }));
      else unwrap(await supabase.from("saved_materials").delete().eq("material_id", materialId).eq("user_id", user!.id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
  });
}

export function useReportMaterial() {
  return useMutation({
    mutationFn: async (input: { materialId: string; reason: ReportReason; details: string }) =>
      unwrap(
        await supabase
          .from("material_reports")
          .insert({ material_id: input.materialId, reason: input.reason, details: input.details.trim() }),
      ),
  });
}
