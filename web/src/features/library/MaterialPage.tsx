import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSession } from "@/app/session";
import { Badge, Button, ErrorBanner, Notice, PageLoader } from "@/components/ui";
import { flashcardContentSchema, studyGuideContentSchema } from "@/domain/content";
import { isQuestionKind } from "@/domain/taxonomy";
import { NotFoundPage } from "@/app/StaticPages";
import { FlashcardReview } from "@/features/quizzes/FlashcardReview";
import { StudyGuideView } from "@/features/quizzes/StudyGuideView";
import { useI18n } from "@/i18n/I18nProvider";
import { useMaterial, useSubjectName } from "./api";
import { KindBadge, LevelBadge, ReportDialog, SaveButton } from "./components";

export function MaterialPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tn, formatDate } = useI18n();
  const { user } = useSession();
  const subjectName = useSubjectName();
  const material = useMaterial(id);
  const [reportOpen, setReportOpen] = useState(false);

  if (material.isPending) return <PageLoader />;
  if (material.error) {
    return (
      <div className="container">
        <ErrorBanner error={material.error} onRetry={() => void material.refetch()} />
      </div>
    );
  }
  const m = material.data;
  if (!m) return <NotFoundPage />;

  const isOwner = m.owner_id === user?.id;
  const isPublished = m.status === "published";

  return (
    <div className="container narrow stack-lg">
      <header className="stack">
        <div className="row wrap gap-sm">
          <KindBadge kind={m.kind} />
          <LevelBadge schoolGrade={m.school_grade} cefrLevel={m.cefr_level} difficulty={m.difficulty_level} />
          <Badge>{m.language.toUpperCase()}</Badge>
          {!isPublished && <Badge tone="warning">{t(`status.${m.status}`)}</Badge>}
        </div>
        <h1>{m.title}</h1>
        {m.description && <p className="lead">{m.description}</p>}
        <p className="muted">
          {subjectName(m.subject_code)}
          {m.authorName && <> · {t("library.by", { name: m.authorName })}</>}
          {m.published_at && <> · {formatDate(m.published_at)}</>}
        </p>
        <div className="row wrap">
          {isPublished && <SaveButton materialId={m.id} saved={m.isSaved} />}
          {isOwner && (
            <Link className="btn btn-secondary" to={`/teach/${m.id}`}>
              {t("common.edit")}
            </Link>
          )}
          {isPublished && !isOwner && (
            <Button variant="ghost" onClick={() => setReportOpen(true)}>
              {t("report.open")}
            </Button>
          )}
        </div>
      </header>

      {!isPublished && isOwner && <Notice tone="info">{t("material.preview_notice")}</Notice>}

      {isQuestionKind(m.kind) && (
        <section className="card stack">
          <p>{tn("counts.questions", m.questionCount)}</p>
          {m.kind === "practice_test" && <p className="muted">{t("material.practice_test.hint")}</p>}
          <p className="muted small">{t("quiz.short_answer_limitation")}</p>
          <div>
            <Link className="btn btn-primary" to={`/m/${m.id}/take`} aria-disabled={m.questionCount === 0}>
              {t("quiz.start")}
            </Link>
          </div>
        </section>
      )}

      {m.kind === "flashcards" && <FlashcardReview content={flashcardContentSchema.parse(m.content)} />}
      {m.kind === "study_guide" && <StudyGuideView content={studyGuideContentSchema.parse(m.content)} />}

      {isPublished && <ReportDialog materialId={m.id} open={reportOpen} onClose={() => setReportOpen(false)} />}
    </div>
  );
}
