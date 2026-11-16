import { z } from "zod";
import { QUESTION_TYPES, type QuestionType } from "./taxonomy";

/** Versioned JSON content blocks (validated again by the database). */
export const flashcardContentSchema = z.object({
  version: z.literal(1),
  cards: z.array(z.object({ front: z.string(), back: z.string() })),
});
export type FlashcardContent = z.infer<typeof flashcardContentSchema>;

export const studyGuideContentSchema = z.object({
  version: z.literal(1),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});
export type StudyGuideContent = z.infer<typeof studyGuideContentSchema>;

const questionTypeSchema = z.enum(QUESTION_TYPES as [QuestionType, ...QuestionType[]]);
const optionSchema = z.object({ id: z.string(), text: z.string() });

/** Student-visible question (no answer key). */
export const questionSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  type: questionTypeSchema,
  prompt: z.string(),
  options: z.array(optionSchema),
});
export type Question = z.infer<typeof questionSchema>;

/** What a student submits for one question; mirrors app_private.response_is_correct. */
export type QuestionResponse =
  | { option_id: string }
  | { option_ids: string[] }
  | { value: boolean }
  | { text: string };

export const attemptResultSchema = z.object({
  attempt_id: z.string().uuid(),
  material_id: z.string().uuid().nullable(),
  material_title: z.string(),
  submitted_at: z.string().nullable(),
  question_count: z.number().int().nullable(),
  correct_count: z.number().int().nullable(),
  score_percent: z.coerce.number().nullable(),
  answers_revealed: z.boolean(),
  answers: z.array(
    z.object({
      question_id: z.string().uuid().nullable(),
      position: z.number().int(),
      type: questionTypeSchema.nullable(),
      prompt: z.string().nullable(),
      options: z.array(optionSchema).nullable(),
      response: z.record(z.unknown()),
      is_correct: z.boolean(),
      correct: z
        .object({
          correct_option_ids: z.array(z.string()),
          correct_bool: z.boolean().nullable(),
          accepted_answers: z.array(z.string()),
        })
        .optional(),
      explanation: z.string().optional(),
    }),
  ),
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;
