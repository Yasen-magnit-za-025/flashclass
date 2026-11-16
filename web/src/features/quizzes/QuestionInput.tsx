import type { Question, QuestionResponse } from "@/domain/content";
import { useI18n } from "@/i18n/I18nProvider";

/** Renders the answer control for one question. Purely presentational. */
export function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: QuestionResponse | undefined;
  onChange: (value: QuestionResponse) => void;
}) {
  const { t } = useI18n();
  const name = `q-${question.id}`;

  switch (question.type) {
    case "single_choice": {
      const selected = value && "option_id" in value ? value.option_id : undefined;
      return (
        <fieldset className="choices">
          <legend className="visually-hidden">{question.prompt}</legend>
          {question.options.map((o) => (
            <label key={o.id} className="choice">
              <input type="radio" name={name} checked={selected === o.id} onChange={() => onChange({ option_id: o.id })} />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case "multiple_select": {
      const selected = value && "option_ids" in value ? value.option_ids : [];
      const toggle = (id: string) =>
        onChange({ option_ids: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
      return (
        <fieldset className="choices">
          <legend className="muted small">{t("quiz.select_all")}</legend>
          {question.options.map((o) => (
            <label key={o.id} className="choice">
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case "true_false": {
      const selected = value && "value" in value ? value.value : undefined;
      return (
        <fieldset className="choices row">
          <legend className="visually-hidden">{question.prompt}</legend>
          {[true, false].map((b) => (
            <label key={String(b)} className="choice">
              <input type="radio" name={name} checked={selected === b} onChange={() => onChange({ value: b })} />
              <span>{b ? t("quiz.true") : t("quiz.false")}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case "short_answer": {
      const text = value && "text" in value ? value.text : "";
      return (
        <input
          className="short-answer"
          aria-label={question.prompt}
          maxLength={500}
          value={text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={t("quiz.short_answer.placeholder")}
        />
      );
    }
  }
}

export function isAnswered(value: QuestionResponse | undefined): boolean {
  if (!value) return false;
  if ("option_ids" in value) return value.option_ids.length > 0;
  if ("text" in value) return value.text.trim().length > 0;
  return true;
}
