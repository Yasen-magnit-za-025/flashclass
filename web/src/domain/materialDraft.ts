import { z } from "zod";
import type { Json } from "@/types/database";
import {
  CEFR_LEVELS,
  DIFFICULTY_LEVELS,
  MATERIAL_KINDS,
  QUESTION_TYPES,
  hasRequiredLevel,
  isQuestionKind,
  normalizeSuitability,
  type CefrLevel,
  type DifficultyLevel,
  type LevelScheme,
  type MaterialKind,
  type MaterialStatus,
  type QuestionType,
} from "./taxonomy";

// ---------------------------------------------------------------------------
// Editor model
// ---------------------------------------------------------------------------

export interface DraftOption {
  id: string;
  text: string;
}

export interface DraftQuestion {
  /** Stable client key for React lists. */
  key: string;
  /** Server id once saved; reused so attempts keep pointing at the same question. */
  id: string | null;
  type: QuestionType;
  prompt: string;
  options: DraftOption[];
  correctOptionIds: string[];
  correctBool: boolean | null;
  acceptedAnswers: string[];
  explanation: string;
}

export interface DraftCard {
  key: string;
  front: string;
  back: string;
}

export interface DraftSection {
  key: string;
  heading: string;
  body: string;
}

export interface MaterialDraft {
  id: string | null;
  kind: MaterialKind;
  status: MaterialStatus;
  title: string;
  description: string;
  language: string;
  subjectCode: string;
  schoolGrade: number | null;
  cefrLevel: CefrLevel | null;
  difficultyLevel: DifficultyLevel | null;
  showAnswersAfterSubmit: boolean;
  questions: DraftQuestion[];
  cards: DraftCard[];
  sections: DraftSection[];
}

export const LIMITS = {
  title: 200,
  description: 2000,
  questions: 200,
  prompt: 2000,
  optionsMin: 2,
  optionsMax: 10,
  optionText: 500,
  acceptedAnswers: 20,
  acceptedAnswer: 200,
  explanation: 2000,
  cards: 500,
  cardFront: 1000,
  cardBack: 2000,
  sections: 100,
  heading: 200,
  body: 20000,
} as const;

let keyCounter = 0;
export const newKey = (): string => `k${Date.now().toString(36)}${(keyCounter++).toString(36)}`;

export function nextOptionId(options: DraftOption[]): string {
  const used = new Set(options.map((o) => o.id));
  for (let i = 0; ; i++) {
    const id = String.fromCharCode(97 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");
    if (!used.has(id)) return id;
  }
}

export function newQuestion(type: QuestionType = "single_choice"): DraftQuestion {
  const base: DraftQuestion = {
    key: newKey(),
    id: null,
    type,
    prompt: "",
    options: [],
    correctOptionIds: [],
    correctBool: null,
    acceptedAnswers: [],
    explanation: "",
  };
  return changeQuestionType(base, type);
}

/** Switches type while keeping whatever still makes sense (prompt, explanation, options). */
export function changeQuestionType(q: DraftQuestion, type: QuestionType): DraftQuestion {
  const isChoice = type === "single_choice" || type === "multiple_select";
  let options = isChoice ? q.options : [];
  if (isChoice && options.length < 2) {
    options = [...options];
    while (options.length < 2) options.push({ id: nextOptionId(options), text: "" });
  }
  let correctOptionIds = isChoice ? q.correctOptionIds.filter((id) => options.some((o) => o.id === id)) : [];
  if (type === "single_choice") correctOptionIds = correctOptionIds.slice(0, 1);
  return {
    ...q,
    type,
    options,
    correctOptionIds,
    correctBool: type === "true_false" ? q.correctBool : null,
    acceptedAnswers: type === "short_answer" ? (q.acceptedAnswers.length ? q.acceptedAnswers : [""]) : [],
  };
}

export function emptyDraft(kind: MaterialKind): MaterialDraft {
  return {
    id: null,
    kind,
    status: "draft",
    title: "",
    description: "",
    language: "bg",
    subjectCode: "",
    schoolGrade: null,
    cefrLevel: null,
    difficultyLevel: null,
    showAnswersAfterSubmit: true,
    questions: isQuestionKind(kind) ? [newQuestion()] : [],
    cards: kind === "flashcards" ? [{ key: newKey(), front: "", back: "" }] : [],
    sections: kind === "study_guide" ? [{ key: newKey(), heading: "", body: "" }] : [],
  };
}

// ---------------------------------------------------------------------------
// Validation (mirrors the database; the database remains authoritative)
// ---------------------------------------------------------------------------

export type DraftIssueCode =
  | "title_required"
  | "subject_required"
  | "level_required"
  | "no_items"
  | "prompt_required"
  | "option_text_required"
  | "correct_option_required"
  | "single_correct_only"
  | "true_false_answer_required"
  | "accepted_answer_required"
  | "card_incomplete"
  | "section_body_required"
  | "too_long"
  /** Rejected by the database for this item (e.g. invalid answer key). */
  | "invalid_item";

export interface DraftIssue {
  code: DraftIssueCode;
  /** Index of the question/card/section the issue belongs to, if any. */
  index?: number;
}

/**
 * Validates a draft. `forPublish` adds the rules that only apply at publication
 * (non-empty material, suitability level).
 */
export function validateDraft(draft: MaterialDraft, scheme: LevelScheme | undefined, forPublish: boolean): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!draft.title.trim()) issues.push({ code: "title_required" });
  if (draft.title.length > LIMITS.title || draft.description.length > LIMITS.description) issues.push({ code: "too_long" });
  if (!draft.subjectCode) issues.push({ code: "subject_required" });

  if (forPublish) {
    const suitability = { school_grade: draft.schoolGrade, cefr_level: draft.cefrLevel, difficulty_level: draft.difficultyLevel };
    if (draft.subjectCode && !hasRequiredLevel(scheme, suitability)) issues.push({ code: "level_required" });
  }

  if (isQuestionKind(draft.kind)) {
    if (forPublish && draft.questions.length === 0) issues.push({ code: "no_items" });
    draft.questions.forEach((q, index) => {
      if (!q.prompt.trim()) issues.push({ code: "prompt_required", index });
      if (q.prompt.length > LIMITS.prompt || q.explanation.length > LIMITS.explanation) issues.push({ code: "too_long", index });
      if (q.type === "single_choice" || q.type === "multiple_select") {
        if (q.options.some((o) => !o.text.trim())) issues.push({ code: "option_text_required", index });
        if (q.correctOptionIds.length === 0) issues.push({ code: "correct_option_required", index });
        if (q.type === "single_choice" && q.correctOptionIds.length > 1) issues.push({ code: "single_correct_only", index });
      }
      if (q.type === "true_false" && q.correctBool === null) issues.push({ code: "true_false_answer_required", index });
      if (q.type === "short_answer" && !q.acceptedAnswers.some((a) => a.trim())) {
        issues.push({ code: "accepted_answer_required", index });
      }
    });
  } else if (draft.kind === "flashcards") {
    if (forPublish && draft.cards.length === 0) issues.push({ code: "no_items" });
    draft.cards.forEach((c, index) => {
      if (!c.front.trim() || !c.back.trim()) issues.push({ code: "card_incomplete", index });
    });
  } else {
    if (forPublish && draft.sections.length === 0) issues.push({ code: "no_items" });
    draft.sections.forEach((s, index) => {
      if (!s.body.trim()) issues.push({ code: "section_body_required", index });
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Draft <-> save_material payload
// ---------------------------------------------------------------------------

export function toSavePayload(draft: MaterialDraft, scheme: LevelScheme | undefined): Json {
  const suitability = normalizeSuitability(scheme, {
    school_grade: draft.schoolGrade,
    cefr_level: draft.cefrLevel,
    difficulty_level: draft.difficultyLevel,
  });
  const payload: { [key: string]: Json } = {
    kind: draft.kind,
    title: draft.title.trim(),
    description: draft.description.trim(),
    language: draft.language,
    subject_code: draft.subjectCode,
    school_grade: suitability.school_grade,
    cefr_level: suitability.cefr_level,
    difficulty_level: suitability.difficulty_level,
    show_answers_after_submit: draft.showAnswersAfterSubmit,
  };
  if (draft.id) payload.id = draft.id;

  if (isQuestionKind(draft.kind)) {
    payload.questions = draft.questions.map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      type: q.type,
      prompt: q.prompt.trim(),
      options: q.options.map((o) => ({ id: o.id, text: o.text.trim() })),
      explanation: q.explanation.trim(),
      answer: {
        correct_option_ids: q.correctOptionIds,
        correct_bool: q.correctBool,
        accepted_answers: q.acceptedAnswers.map((a) => a.trim()).filter(Boolean),
      },
    }));
  } else if (draft.kind === "flashcards") {
    payload.content = {
      version: 1,
      cards: draft.cards.map((c) => ({ front: c.front.trim(), back: c.back.trim() })),
    };
  } else {
    payload.content = {
      version: 1,
      sections: draft.sections.map((s) => ({ heading: s.heading.trim(), body: s.body.trim() })),
    };
  }
  return payload;
}

const editPayloadSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(MATERIAL_KINDS as [MaterialKind, ...MaterialKind[]]),
  status: z.enum(["draft", "published", "archived", "hidden"]),
  title: z.string(),
  description: z.string(),
  language: z.string(),
  subject_code: z.string(),
  school_grade: z.number().int().nullable(),
  cefr_level: z.enum(CEFR_LEVELS as [CefrLevel, ...CefrLevel[]]).nullable(),
  difficulty_level: z.enum(DIFFICULTY_LEVELS as [DifficultyLevel, ...DifficultyLevel[]]).nullable(),
  show_answers_after_submit: z.boolean(),
  content: z
    .object({
      version: z.literal(1),
      cards: z.array(z.object({ front: z.string(), back: z.string() })).optional(),
      sections: z.array(z.object({ heading: z.string(), body: z.string() })).optional(),
    })
    .nullable(),
  questions: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.enum(QUESTION_TYPES as [QuestionType, ...QuestionType[]]),
      prompt: z.string(),
      options: z.array(z.object({ id: z.string(), text: z.string() })),
      explanation: z.string(),
      answer: z.object({
        correct_option_ids: z.array(z.string()),
        correct_bool: z.boolean().nullable(),
        accepted_answers: z.array(z.string()),
      }),
    }),
  ),
});

export type EditPayload = z.infer<typeof editPayloadSchema>;

/** Parses get_material_for_edit output into the editor model. */
export function fromEditPayload(raw: unknown): MaterialDraft {
  const p = editPayloadSchema.parse(raw);
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    title: p.title,
    description: p.description,
    language: p.language,
    subjectCode: p.subject_code,
    schoolGrade: p.school_grade,
    cefrLevel: p.cefr_level,
    difficultyLevel: p.difficulty_level,
    showAnswersAfterSubmit: p.show_answers_after_submit,
    questions: p.questions.map((q) => ({
      key: newKey(),
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      correctOptionIds: q.answer.correct_option_ids,
      correctBool: q.answer.correct_bool,
      acceptedAnswers: q.answer.accepted_answers.length ? q.answer.accepted_answers : q.type === "short_answer" ? [""] : [],
      explanation: q.explanation,
    })),
    cards: (p.content?.cards ?? []).map((c) => ({ key: newKey(), ...c })),
    sections: (p.content?.sections ?? []).map((s) => ({ key: newKey(), ...s })),
  };
}
