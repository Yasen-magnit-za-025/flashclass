import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Dialog, EmptyState, ErrorBanner, PageLoader } from "@/components/ui";
import type { QuestionResponse } from "@/domain/content";
import { useMaterial } from "@/features/library/api";
import { useI18n } from "@/i18n/I18nProvider";
import { startAttempt, submitAttempt, useQuestions } from "./api";
import { isAnswered, QuestionInput } from "./QuestionInput";

const draftKey = (attemptId: string) => `flashclass.attempt.${attemptId}`;

function loadDraft(attemptId: string): Record<string, QuestionResponse> {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(attemptId)) ?? "{}") as Record<string, QuestionResponse>;
  } catch {
    return {};
  }
}

export function TakeQuizPage() {
  const { id: materialId } = useParams<{ id: string }>();
  const { t, tn } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const material = useMaterial(materialId);
  const questions = useQuestions(materialId);
  // start_attempt resumes an open attempt, so this is safe to run on every visit.
  const attempt = useQuery({
    queryKey: ["attempt-start", materialId],
    queryFn: () => startAttempt(materialId!),
    enabled: Boolean(materialId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const attemptId = attempt.data;
  const [answers, setAnswers] = useState<Record<string, QuestionResponse>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Restore in-progress answers (survives reloads within the tab).
  useEffect(() => {
    if (attemptId) setAnswers(loadDraft(attemptId));
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) return;
    try {
      sessionStorage.setItem(draftKey(attemptId), JSON.stringify(answers));
    } catch {
      /* storage unavailable */
    }
  }, [answers, attemptId]);

  const submit = useMutation({
    mutationFn: () => submitAttempt(attemptId!, Object.fromEntries(Object.entries(answers).filter(([, v]) => isAnswered(v)))),
    onSuccess: (result) => {
      try {
        sessionStorage.removeItem(draftKey(attemptId!));
      } catch {
        /* ignore */
      }
      queryClient.setQueryData(["attempt-result", result.attempt_id], result);
      void queryClient.invalidateQueries({ queryKey: ["attempts"] });
      queryClient.removeQueries({ queryKey: ["attempt-start", materialId] });
      navigate(`/attempts/${result.attempt_id}`, { replace: true });
    },
  });

  if (material.isPending || questions.isPending || attempt.isPending) return <PageLoader />;
  const loadError = material.error ?? questions.error ?? attempt.error;
  if (loadError) {
    return (
      <div className="container narrow">
        <ErrorBanner error={loadError} />
        <Link to={`/m/${materialId}`}>{t("common.back")}</Link>
      </div>
    );
  }
  if (!material.data || !questions.data?.length) {
    return (
      <div className="container narrow">
        <EmptyState title={t("quiz.empty")} />
      </div>
    );
  }

  const list = questions.data;
  const answeredCount = list.filter((q) => isAnswered(answers[q.id])).length;
  const unanswered = list.length - answeredCount;

  return (
    <div className="container narrow stack-lg">
      <header className="stack">
        <h1>{material.data.title}</h1>
        <p className="muted" aria-live="polite">
          {t("quiz.progress", { answered: answeredCount, total: list.length })}
        </p>
        <progress max={list.length} value={answeredCount} />
      </header>

      <ol className="question-list">
        {list.map((q, index) => (
          <li key={q.id} className="card question">
            <p className="question-prompt">
              <span className="question-number">{index + 1}.</span> {q.prompt}
            </p>
            <QuestionInput question={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          </li>
        ))}
      </ol>

      <ErrorBanner error={submit.error} />
      <div className="row space-between sticky-actions">
        <Link to={`/m/${materialId}`}>{t("common.cancel")}</Link>
        <Button variant="primary" busy={submit.isPending} onClick={() => (unanswered > 0 ? setConfirmOpen(true) : submit.mutate())}>
          {t("quiz.submit")}
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("quiz.confirm.title")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t("quiz.confirm.keep_going")}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmOpen(false);
                submit.mutate();
              }}
            >
              {t("quiz.submit")}
            </Button>
          </>
        }
      >
        <p>{tn("quiz.confirm.unanswered", unanswered)}</p>
      </Dialog>
    </div>
  );
}
