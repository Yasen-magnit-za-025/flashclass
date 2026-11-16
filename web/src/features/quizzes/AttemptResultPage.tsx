import { Link, useParams } from "react-router-dom";
import { Badge, ErrorBanner, Notice, PageLoader } from "@/components/ui";
import type { AttemptResult } from "@/domain/content";
import { useI18n } from "@/i18n/I18nProvider";
import { useAttemptResult } from "./api";

type Answer = AttemptResult["answers"][number];

function describeResponse(answer: Answer, t: ReturnType<typeof useI18n>["t"]): string {
  const r = answer.response;
  const optionText = (id: unknown) => answer.options?.find((o) => o.id === id)?.text ?? String(id);
  if (typeof r.option_id === "string") return optionText(r.option_id);
  if (Array.isArray(r.option_ids)) return r.option_ids.map(optionText).join(", ");
  if (typeof r.value === "boolean") return r.value ? t("quiz.true") : t("quiz.false");
  if (typeof r.text === "string") return r.text;
  return "";
}

function describeCorrect(answer: Answer, t: ReturnType<typeof useI18n>["t"]): string | null {
  const c = answer.correct;
  if (!c) return null;
  if (answer.type === "true_false") return c.correct_bool ? t("quiz.true") : t("quiz.false");
  if (answer.type === "short_answer") return c.accepted_answers.join(" / ");
  return c.correct_option_ids.map((id) => answer.options?.find((o) => o.id === id)?.text ?? id).join(", ");
}

export function AttemptResultPage() {
  const { id } = useParams<{ id: string }>();
  const { t, formatNumber, formatDate } = useI18n();
  const result = useAttemptResult(id);

  if (result.isPending) return <PageLoader />;
  if (result.error || !result.data) {
    return (
      <div className="container narrow">
        <ErrorBanner error={result.error} />
      </div>
    );
  }
  const r = result.data;

  return (
    <div className="container narrow stack-lg">
      <header className="stack">
        <h1>{r.material_title}</h1>
        <p className="score" aria-label={t("results.score")}>
          {formatNumber((r.score_percent ?? 0) / 100, { style: "percent", maximumFractionDigits: 0 })}
        </p>
        <p className="muted">
          {t("results.summary", { correct: r.correct_count ?? 0, total: r.question_count ?? 0 })} · {formatDate(r.submitted_at)}
        </p>
        <div className="row wrap">
          {r.material_id && (
            <Link className="btn btn-primary" to={`/m/${r.material_id}/take`}>
              {t("results.retry")}
            </Link>
          )}
          <Link className="btn btn-secondary" to="/progress">
            {t("nav.progress")}
          </Link>
        </div>
      </header>

      {!r.answers_revealed && <Notice>{t("results.answers_hidden")}</Notice>}

      <ol className="question-list">
        {r.answers.map((a) => {
          const response = describeResponse(a, t);
          const correct = describeCorrect(a, t);
          return (
            <li key={a.position} className={`card question ${a.is_correct ? "is-correct" : "is-incorrect"}`}>
              <div className="row space-between">
                <p className="question-prompt">
                  <span className="question-number">{a.position + 1}.</span> {a.prompt ?? t("results.question_removed")}
                </p>
                <Badge tone={a.is_correct ? "success" : "danger"}>{a.is_correct ? t("results.correct") : t("results.incorrect")}</Badge>
              </div>
              <p>
                <span className="muted">{t("results.your_answer")}:</span> {response || <em>{t("results.no_answer")}</em>}
              </p>
              {!a.is_correct && correct && (
                <p>
                  <span className="muted">{t("results.correct_answer")}:</span> {correct}
                </p>
              )}
              {a.explanation && <p className="explanation">{a.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
