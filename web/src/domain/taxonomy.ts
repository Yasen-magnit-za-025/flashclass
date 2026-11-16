import type { Enums, Tables } from "@/types/database";

export type MaterialKind = Enums<"material_kind">;
export type MaterialStatus = Enums<"material_status">;
export type QuestionType = Enums<"question_type">;
export type CefrLevel = Enums<"cefr_level">;
export type DifficultyLevel = Enums<"difficulty_level">;
export type AppRole = Enums<"app_role">;
export type ReportReason = Enums<"report_reason">;
export type UiLocale = Enums<"ui_locale">;
export type Subject = Tables<"subjects">;
export type LevelScheme = Subject["level_scheme"];

export const MATERIAL_KINDS: readonly MaterialKind[] = ["quiz", "practice_test", "flashcards", "study_guide"];
export const QUESTION_KINDS: readonly MaterialKind[] = ["quiz", "practice_test"];
export const QUESTION_TYPES: readonly QuestionType[] = ["single_choice", "multiple_select", "true_false", "short_answer"];
export const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = ["beginner", "intermediate", "advanced", "expert"];
export const SCHOOL_GRADES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const REPORT_REASONS: readonly ReportReason[] = ["inappropriate", "incorrect", "spam", "copyright", "other"];
export const UI_LOCALES: readonly UiLocale[] = ["bg", "en"];

/** Content languages offered in pickers. Content may be in any language; this is a convenience list. */
export const CONTENT_LANGUAGES = ["bg", "en", "de", "fr", "es", "ru", "it", "tr", "el", "ro", "mk", "sr"] as const;

export const isQuestionKind = (kind: MaterialKind): boolean => QUESTION_KINDS.includes(kind);

export interface Suitability {
  school_grade: number | null;
  cefr_level: CefrLevel | null;
  difficulty_level: DifficultyLevel | null;
}

/** Clears the level fields that don't belong to a subject's scheme (mirrors the DB trigger). */
export function normalizeSuitability(scheme: LevelScheme | undefined, s: Suitability): Suitability {
  return {
    school_grade: scheme === "grade" ? s.school_grade : null,
    cefr_level: scheme === "cefr" ? s.cefr_level : null,
    difficulty_level: scheme === "difficulty" ? s.difficulty_level : null,
  };
}

export function hasRequiredLevel(scheme: LevelScheme | undefined, s: Suitability): boolean {
  if (scheme === "grade") return s.school_grade !== null;
  if (scheme === "cefr") return s.cefr_level !== null;
  if (scheme === "difficulty") return s.difficulty_level !== null;
  return false;
}
