import { z } from "zod";
import { LIMITS, newKey, nextOptionId, type DraftCard, type DraftOption, type DraftQuestion, type DraftSection } from "@/domain/materialDraft";
import { QUESTION_TYPES, type MaterialKind, type QuestionType } from "@/domain/taxonomy";

/**
 * Contract for model output returned by the local companion. The companion
 * validates it with Pydantic (companion/flashclass_companion/schemas.py); the
 * browser validates it AGAIN here because model output is untrusted.
 * Shared fixtures in /shared/fixtures/generated keep both sides honest.
 */
const generatedQuestionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES as [QuestionType, ...QuestionType[]]),
    prompt: z.string().trim().min(1).max(LIMITS.prompt),
    options: z.array(z.string().trim().min(1).max(LIMITS.optionText)).max(LIMITS.optionsMax).default([]),
    correct_indices: z.array(z.number().int().min(0)).default([]),
    correct_bool: z.boolean().nullable().default(null),
    accepted_answers: z.array(z.string().trim().min(1).max(LIMITS.acceptedAnswer)).max(LIMITS.acceptedAnswers).default([]),
    explanation: z.string().max(LIMITS.explanation).default(""),
  })
  .superRefine((q, ctx) => {
    const isChoice = q.type === "single_choice" || q.type === "multiple_select";
    if (isChoice) {
      if (q.options.length < LIMITS.optionsMin) ctx.addIssue({ code: "custom", message: "too_few_options" });
      if (q.correct_indices.some((i) => i >= q.options.length)) ctx.addIssue({ code: "custom", message: "bad_correct_index" });
      if (q.correct_indices.length === 0) ctx.addIssue({ code: "custom", message: "no_correct_option" });
      if (q.type === "single_choice" && q.correct_indices.length !== 1) ctx.addIssue({ code: "custom", message: "single_needs_one" });
    }
    if (q.type === "true_false" && q.correct_bool === null) ctx.addIssue({ code: "custom", message: "tf_needs_answer" });
    if (q.type === "short_answer" && q.accepted_answers.length === 0) ctx.addIssue({ code: "custom", message: "short_needs_answer" });
  });

export const generatedDraftSchema = z
  .object({
  kind: z.enum(["quiz", "practice_test", "flashcards", "study_guide"]),
  title: z.string().trim().min(1).max(LIMITS.title),
  description: z.string().max(LIMITS.description).default(""),
  questions: z.array(generatedQuestionSchema).max(LIMITS.questions).default([]),
  cards: z
    .array(z.object({ front: z.string().trim().min(1).max(LIMITS.cardFront), back: z.string().trim().min(1).max(LIMITS.cardBack) }))
    .max(LIMITS.cards)
    .default([]),
  sections: z
    .array(z.object({ heading: z.string().max(LIMITS.heading).default(""), body: z.string().trim().min(1).max(LIMITS.body) }))
    .max(LIMITS.sections)
    .default([]),
  })
  .refine(
    (d) => (d.kind === "flashcards" ? d.cards : d.kind === "study_guide" ? d.sections : d.questions).length > 0,
    "draft has no items",
  );

export type GeneratedDraft = z.infer<typeof generatedDraftSchema>;

export const generateResponseSchema = z.object({
  draft: generatedDraftSchema,
  model: z.string(),
  source: z
    .object({
      filename: z.string().nullable().optional(),
      chars_used: z.number().int(),
      truncated: z.boolean(),
    })
    .nullable()
    .optional(),
});

export type GenerateResponse = z.infer<typeof generateResponseSchema>;

export interface GeneratedParts {
  title: string;
  description: string;
  questions: DraftQuestion[];
  cards: DraftCard[];
  sections: DraftSection[];
}

/** Converts validated model output into editor items (never saved automatically). */
export function generatedToDraftParts(g: GeneratedDraft): GeneratedParts {
  return {
    title: g.title,
    description: g.description,
    questions: g.questions.map((q) => {
      const options: DraftOption[] = [];
      for (const text of q.options) options.push({ id: nextOptionId(options), text });
      const isChoice = q.type === "single_choice" || q.type === "multiple_select";
      return {
        key: newKey(),
        id: null,
        type: q.type,
        prompt: q.prompt,
        options: isChoice ? options : [],
        correctOptionIds: isChoice ? [...new Set(q.correct_indices)].map((i) => options[i]!.id) : [],
        correctBool: q.type === "true_false" ? q.correct_bool : null,
        acceptedAnswers: q.type === "short_answer" ? q.accepted_answers : [],
        explanation: q.explanation,
      };
    }),
    cards: g.cards.map((c) => ({ key: newKey(), front: c.front, back: c.back })),
    sections: g.sections.map((s) => ({ key: newKey(), heading: s.heading, body: s.body })),
  };
}

export function partsMatchKind(kind: MaterialKind, parts: GeneratedParts): number {
  if (kind === "flashcards") return parts.cards.length;
  if (kind === "study_guide") return parts.sections.length;
  return parts.questions.length;
}
