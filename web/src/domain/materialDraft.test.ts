import { describe, expect, it } from "vitest";
import {
  changeQuestionType,
  emptyDraft,
  fromEditPayload,
  newQuestion,
  nextOptionId,
  toSavePayload,
  validateDraft,
  type MaterialDraft,
} from "./materialDraft";

function validQuiz(): MaterialDraft {
  const draft = emptyDraft("quiz");
  draft.title = "Дроби";
  draft.subjectCode = "mathematics";
  draft.schoolGrade = 6;
  draft.questions = [
    {
      ...newQuestion("single_choice"),
      prompt: "1/2 + 1/4?",
      options: [
        { id: "a", text: "3/4" },
        { id: "b", text: "2/6" },
      ],
      correctOptionIds: ["a"],
    },
  ];
  return draft;
}

describe("validateDraft", () => {
  it("accepts a complete quiz for publishing", () => {
    expect(validateDraft(validQuiz(), "grade", true)).toEqual([]);
  });

  it("requires a level only when publishing", () => {
    const draft = { ...validQuiz(), schoolGrade: null };
    expect(validateDraft(draft, "grade", false)).toEqual([]);
    expect(validateDraft(draft, "grade", true)).toContainEqual({ code: "level_required" });
  });

  it("flags per-question problems with their index", () => {
    const draft = validQuiz();
    draft.questions.push({ ...newQuestion("true_false"), prompt: "x" });
    expect(validateDraft(draft, "grade", false)).toContainEqual({ code: "true_false_answer_required", index: 1 });
  });

  it("requires at least one item to publish", () => {
    const draft = { ...validQuiz(), questions: [] };
    expect(validateDraft(draft, "grade", true)).toContainEqual({ code: "no_items" });
  });
});

describe("question helpers", () => {
  it("generates unique option ids", () => {
    expect(nextOptionId([{ id: "a", text: "" }, { id: "c", text: "" }])).toBe("b");
  });

  it("keeps options when switching between choice types and trims to one correct", () => {
    const q = { ...newQuestion("multiple_select"), correctOptionIds: ["a", "b"] };
    const single = changeQuestionType(q, "single_choice");
    expect(single.options).toHaveLength(2);
    expect(single.correctOptionIds).toEqual(["a"]);
  });

  it("clears choice data when switching to short answer", () => {
    const q = changeQuestionType(newQuestion("single_choice"), "short_answer");
    expect(q.options).toEqual([]);
    expect(q.acceptedAnswers).toEqual([""]);
  });
});

describe("save payload round trip", () => {
  it("drops level fields that don't belong to the subject scheme", () => {
    const draft = { ...validQuiz(), cefrLevel: "B1" as const };
    const payload = toSavePayload(draft, "grade") as Record<string, unknown>;
    expect(payload.school_grade).toBe(6);
    expect(payload.cefr_level).toBeNull();
  });

  it("parses the editor payload returned by get_material_for_edit", () => {
    const id = "00000000-0000-4000-a000-000000000001";
    const qid = "00000000-0000-4000-a000-000000000002";
    const draft = fromEditPayload({
      id,
      kind: "quiz",
      status: "draft",
      title: "T",
      description: "",
      language: "bg",
      subject_code: "mathematics",
      school_grade: 6,
      cefr_level: null,
      difficulty_level: null,
      show_answers_after_submit: true,
      content: null,
      questions: [
        {
          id: qid,
          type: "short_answer",
          prompt: "?",
          options: [],
          explanation: "",
          answer: { correct_option_ids: [], correct_bool: null, accepted_answers: ["x"] },
        },
      ],
    });
    expect(draft.questions[0]!.id).toBe(qid);
    const payload = toSavePayload(draft, "grade") as { id: string; questions: { id: string }[] };
    expect(payload.id).toBe(id);
    expect(payload.questions[0]!.id).toBe(qid);
  });
});
