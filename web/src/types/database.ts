// Database types for the `public` schema.
// Hand-written to match supabase/migrations; regenerate from the real schema with
//   npm run db:types
// (requires `supabase start`). The generated file replaces this one verbatim.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AppRole = "student" | "teacher" | "admin";
type UiLocale = "bg" | "en";
type MaterialKind = "quiz" | "flashcards" | "practice_test" | "study_guide";
type MaterialStatus = "draft" | "published" | "archived" | "hidden";
type MaterialVisibility = "private" | "shared";
type QuestionType = "single_choice" | "multiple_select" | "true_false" | "short_answer";
type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type DifficultyLevel = "beginner" | "intermediate" | "advanced" | "expert";
type AttemptStatus = "in_progress" | "submitted";
type ReportStatus = "open" | "resolved" | "dismissed";
type ReportReason = "inappropriate" | "incorrect" | "spam" | "copyright" | "other";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string;
          grade_preference: string | null;
          ui_locale: UiLocale;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          display_name?: string;
          grade_preference?: string | null;
          ui_locale?: UiLocale;
        };
        Relationships: [];
      };
      user_roles: {
        Row: { user_id: string; role: AppRole; granted_at: string; granted_by: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      subjects: {
        Row: {
          code: string;
          level_scheme: "grade" | "cefr" | "difficulty";
          sort_order: number;
          name_bg: string;
          name_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      learning_materials: {
        Row: {
          id: string;
          owner_id: string;
          kind: MaterialKind;
          title: string;
          description: string;
          language: string;
          subject_code: string;
          school_grade: number | null;
          cefr_level: CefrLevel | null;
          difficulty_level: DifficultyLevel | null;
          status: MaterialStatus;
          visibility: MaterialVisibility;
          show_answers_after_submit: boolean;
          content: Json | null;
          content_version: number;
          all_ages_attested_at: string | null;
          published_at: string | null;
          hidden_at: string | null;
          hidden_by: string | null;
          hidden_reason: string | null;
          search: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "learning_materials_subject_code_fkey";
            columns: ["subject_code"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["code"];
          },
        ];
      };
      material_questions: {
        Row: {
          id: string;
          material_id: string;
          position: number;
          type: QuestionType;
          prompt: string;
          options: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "material_questions_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "learning_materials";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_attempts: {
        Row: {
          id: string;
          user_id: string;
          material_id: string | null;
          material_title: string;
          status: AttemptStatus;
          started_at: string;
          submitted_at: string | null;
          question_count: number | null;
          correct_count: number | null;
          score_percent: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "learning_materials";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt_answers: {
        Row: {
          id: string;
          attempt_id: string;
          question_id: string | null;
          position: number;
          response: Json;
          is_correct: boolean;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      saved_materials: {
        Row: { user_id: string; material_id: string; saved_at: string };
        Insert: { material_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "saved_materials_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "learning_materials";
            referencedColumns: ["id"];
          },
        ];
      };
      material_reports: {
        Row: {
          id: string;
          material_id: string;
          reporter_id: string;
          reason: ReportReason;
          details: string;
          status: ReportStatus;
          resolution_note: string;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: { material_id: string; reason: ReportReason; details?: string };
        Update: { status?: ReportStatus; resolution_note?: string };
        Relationships: [
          {
            foreignKeyName: "material_reports_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "learning_materials";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      teacher_directory: {
        Row: { user_id: string | null; display_name: string | null };
        Relationships: [];
      };
    };
    Functions: {
      admin_list_users: {
        Args: { p_search?: string | null; p_limit?: number; p_offset?: number };
        Returns: {
          user_id: string;
          email: string;
          display_name: string;
          roles: AppRole[];
          created_at: string;
        }[];
      };
      admin_set_role: {
        Args: { p_user_id: string; p_role: AppRole; p_enabled: boolean };
        Returns: undefined;
      };
      get_attempt_result: { Args: { p_attempt_id: string }; Returns: Json };
      get_material_for_edit: { Args: { p_id: string }; Returns: Json };
      moderate_material: {
        Args: { p_id: string; p_action: string; p_reason?: string };
        Returns: undefined;
      };
      publish_material: { Args: { p_id: string; p_attest_all_ages: boolean }; Returns: undefined };
      save_material: { Args: { p_material: Json }; Returns: string };
      search_library: {
        Args: {
          p_query?: string | null;
          p_subject?: string | null;
          p_kind?: MaterialKind | null;
          p_school_grade?: number | null;
          p_cefr_level?: CefrLevel | null;
          p_difficulty?: DifficultyLevel | null;
          p_language?: string | null;
          p_saved_only?: boolean;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          id: string;
          kind: MaterialKind;
          title: string;
          description: string;
          language: string;
          subject_code: string;
          school_grade: number | null;
          cefr_level: CefrLevel | null;
          difficulty_level: DifficultyLevel | null;
          published_at: string;
          owner_id: string;
          author_name: string | null;
          item_count: number;
          is_saved: boolean;
        }[];
      };
      start_attempt: { Args: { p_material_id: string }; Returns: string };
      submit_attempt: { Args: { p_attempt_id: string; p_answers: Json }; Returns: Json };
      unpublish_material: { Args: { p_id: string }; Returns: undefined };
    };
    Enums: {
      app_role: AppRole;
      attempt_status: AttemptStatus;
      cefr_level: CefrLevel;
      difficulty_level: DifficultyLevel;
      material_kind: MaterialKind;
      material_status: MaterialStatus;
      material_visibility: MaterialVisibility;
      question_type: QuestionType;
      report_reason: ReportReason;
      report_status: ReportStatus;
      ui_locale: UiLocale;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
