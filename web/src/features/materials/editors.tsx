import type { ReactNode } from "react";
import { Button, Field } from "@/components/ui";
import {
  LIMITS,
  changeQuestionType,
  newKey,
  newQuestion,
  nextOptionId,
  type DraftCard,
  type DraftQuestion,
  type DraftSection,
} from "@/domain/materialDraft";
import { QUESTION_TYPES, type QuestionType } from "@/domain/taxonomy";
import { useI18n } from "@/i18n/I18nProvider";

// ---------------------------------------------------------------------------
// Generic list helpers
// ---------------------------------------------------------------------------

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

function ItemToolbar({
  index,
  count,
  onMove,
  onRemove,
  label,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div className="item-toolbar" role="group" aria-label={label}>
      <Button variant="ghost" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={t("editor.move_up")}>
        ↑
      </Button>
      <Button variant="ghost" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={t("editor.move_down")}>
        ↓
      </Button>
      <Button variant="ghost" onClick={onRemove} aria-label={t("editor.remove")}>
        ✕
      </Button>
    </div>
  );
}

function ItemCard({ id, invalid, children }: { id: string; invalid: boolean; children: ReactNode }) {
  return (
    <li id={id} className={`card editor-item ${invalid ? "is-invalid" : ""}`}>
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

function QuestionEditor({ question: q, onChange }: { question: DraftQuestion; onChange: (q: DraftQuestion) => void }) {
  const { t } = useI18n();
  const isChoice = q.type === "single_choice" || q.type === "multiple_select";

  const toggleCorrect = (optionId: string) => {
    if (q.type === "single_choice") onChange({ ...q, correctOptionIds: [optionId] });
    else
      onChange({
        ...q,
        correctOptionIds: q.correctOptionIds.includes(optionId)
          ? q.correctOptionIds.filter((x) => x !== optionId)
          : [...q.correctOptionIds, optionId],
      });
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <Field label={t("editor.question_type")}>
          <select value={q.type} onChange={(e) => onChange(changeQuestionType(q, e.target.value as QuestionType))}>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`question_types.${type}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t("editor.prompt")}>
        <textarea rows={2} maxLength={LIMITS.prompt} value={q.prompt} onChange={(e) => onChange({ ...q, prompt: e.target.value })} />
      </Field>

      {isChoice && (
        <fieldset className="stack-sm">
          <legend>{q.type === "single_choice" ? t("editor.options.single") : t("editor.options.multiple")}</legend>
          {q.options.map((o, i) => (
            <div key={o.id} className="option-row">
              <input
                type={q.type === "single_choice" ? "radio" : "checkbox"}
                name={`correct-${q.key}`}
                checked={q.correctOptionIds.includes(o.id)}
                onChange={() => toggleCorrect(o.id)}
                aria-label={t("editor.options.mark_correct", { n: i + 1 })}
              />
              <input
                className="grow"
                maxLength={LIMITS.optionText}
                value={o.text}
                aria-label={t("editor.options.text", { n: i + 1 })}
                onChange={(e) => onChange({ ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
              />
              <Button
                variant="ghost"
                disabled={q.options.length <= LIMITS.optionsMin}
                aria-label={t("editor.remove")}
                onClick={() =>
                  onChange({
                    ...q,
                    options: q.options.filter((x) => x.id !== o.id),
                    correctOptionIds: q.correctOptionIds.filter((x) => x !== o.id),
                  })
                }
              >
                ✕
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="ghost"
              disabled={q.options.length >= LIMITS.optionsMax}
              onClick={() => onChange({ ...q, options: [...q.options, { id: nextOptionId(q.options), text: "" }] })}
            >
              + {t("editor.options.add")}
            </Button>
          </div>
        </fieldset>
      )}

      {q.type === "true_false" && (
        <fieldset className="row">
          <legend>{t("editor.correct_answer")}</legend>
          {[true, false].map((b) => (
            <label key={String(b)} className="choice">
              <input type="radio" name={`tf-${q.key}`} checked={q.correctBool === b} onChange={() => onChange({ ...q, correctBool: b })} />
              {b ? t("quiz.true") : t("quiz.false")}
            </label>
          ))}
        </fieldset>
      )}

      {q.type === "short_answer" && (
        <fieldset className="stack-sm">
          <legend>{t("editor.accepted_answers")}</legend>
          <p className="muted small">{t("editor.accepted_answers.hint")}</p>
          {q.acceptedAnswers.map((a, i) => (
            <div key={i} className="option-row">
              <input
                className="grow"
                maxLength={LIMITS.acceptedAnswer}
                value={a}
                aria-label={t("editor.accepted_answers.n", { n: i + 1 })}
                onChange={(e) => onChange({ ...q, acceptedAnswers: q.acceptedAnswers.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <Button
                variant="ghost"
                disabled={q.acceptedAnswers.length <= 1}
                aria-label={t("editor.remove")}
                onClick={() => onChange({ ...q, acceptedAnswers: q.acceptedAnswers.filter((_, j) => j !== i) })}
              >
                ✕
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="ghost"
              disabled={q.acceptedAnswers.length >= LIMITS.acceptedAnswers}
              onClick={() => onChange({ ...q, acceptedAnswers: [...q.acceptedAnswers, ""] })}
            >
              + {t("editor.accepted_answers.add")}
            </Button>
          </div>
        </fieldset>
      )}

      <Field label={t("editor.explanation")} hint={t("editor.explanation.hint")}>
        <textarea rows={2} maxLength={LIMITS.explanation} value={q.explanation} onChange={(e) => onChange({ ...q, explanation: e.target.value })} />
      </Field>
    </div>
  );
}

export function QuestionsEditor({
  questions,
  invalid,
  onChange,
}: {
  questions: DraftQuestion[];
  invalid: ReadonlySet<number>;
  onChange: (questions: DraftQuestion[]) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="stack">
      <h2>{t("editor.questions")}</h2>
      <ol className="editor-list">
        {questions.map((q, i) => (
          <ItemCard key={q.key} id={`item-${i}`} invalid={invalid.has(i)}>
            <div className="row space-between">
              <strong>{t("editor.question_n", { n: i + 1 })}</strong>
              <ItemToolbar
                index={i}
                count={questions.length}
                label={t("editor.question_n", { n: i + 1 })}
                onMove={(to) => onChange(move(questions, i, to))}
                onRemove={() => onChange(questions.filter((_, j) => j !== i))}
              />
            </div>
            <QuestionEditor question={q} onChange={(next) => onChange(questions.map((x, j) => (j === i ? next : x)))} />
          </ItemCard>
        ))}
      </ol>
      <div>
        <Button disabled={questions.length >= LIMITS.questions} onClick={() => onChange([...questions, newQuestion()])}>
          + {t("editor.add_question")}
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

export function CardsEditor({
  cards,
  invalid,
  onChange,
}: {
  cards: DraftCard[];
  invalid: ReadonlySet<number>;
  onChange: (cards: DraftCard[]) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="stack">
      <h2>{t("editor.cards")}</h2>
      <ol className="editor-list">
        {cards.map((c, i) => (
          <ItemCard key={c.key} id={`item-${i}`} invalid={invalid.has(i)}>
            <div className="row space-between">
              <strong>{t("editor.card_n", { n: i + 1 })}</strong>
              <ItemToolbar
                index={i}
                count={cards.length}
                label={t("editor.card_n", { n: i + 1 })}
                onMove={(to) => onChange(move(cards, i, to))}
                onRemove={() => onChange(cards.filter((_, j) => j !== i))}
              />
            </div>
            <div className="grid-2">
              <Field label={t("flashcards.front")}>
                <textarea rows={2} maxLength={LIMITS.cardFront} value={c.front} onChange={(e) => onChange(cards.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} />
              </Field>
              <Field label={t("flashcards.back")}>
                <textarea rows={2} maxLength={LIMITS.cardBack} value={c.back} onChange={(e) => onChange(cards.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} />
              </Field>
            </div>
          </ItemCard>
        ))}
      </ol>
      <div>
        <Button disabled={cards.length >= LIMITS.cards} onClick={() => onChange([...cards, { key: newKey(), front: "", back: "" }])}>
          + {t("editor.add_card")}
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Study guide
// ---------------------------------------------------------------------------

export function SectionsEditor({
  sections,
  invalid,
  onChange,
}: {
  sections: DraftSection[];
  invalid: ReadonlySet<number>;
  onChange: (sections: DraftSection[]) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="stack">
      <h2>{t("editor.sections")}</h2>
      <p className="muted small">{t("editor.sections.hint")}</p>
      <ol className="editor-list">
        {sections.map((s, i) => (
          <ItemCard key={s.key} id={`item-${i}`} invalid={invalid.has(i)}>
            <div className="row space-between">
              <strong>{t("study_guide.section", { n: i + 1 })}</strong>
              <ItemToolbar
                index={i}
                count={sections.length}
                label={t("study_guide.section", { n: i + 1 })}
                onMove={(to) => onChange(move(sections, i, to))}
                onRemove={() => onChange(sections.filter((_, j) => j !== i))}
              />
            </div>
            <Field label={t("editor.heading")}>
              <input maxLength={LIMITS.heading} value={s.heading} onChange={(e) => onChange(sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))} />
            </Field>
            <Field label={t("editor.body")}>
              <textarea rows={6} maxLength={LIMITS.body} value={s.body} onChange={(e) => onChange(sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
            </Field>
          </ItemCard>
        ))}
      </ol>
      <div>
        <Button disabled={sections.length >= LIMITS.sections} onClick={() => onChange([...sections, { key: newKey(), heading: "", body: "" }])}>
          + {t("editor.add_section")}
        </Button>
      </div>
    </section>
  );
}
