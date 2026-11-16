import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Dialog, ErrorBanner, Field, Notice } from "@/components/ui";
import { REPORT_REASONS, type CefrLevel, type DifficultyLevel, type MaterialKind, type ReportReason } from "@/domain/taxonomy";
import { useI18n } from "@/i18n/I18nProvider";
import { AppError } from "@/lib/errors";
import { useReportMaterial, useSubjectName, useToggleSaved, type LibraryItem } from "./api";

export function LevelBadge({
  schoolGrade,
  cefrLevel,
  difficulty,
}: {
  schoolGrade: number | null;
  cefrLevel: CefrLevel | null;
  difficulty: DifficultyLevel | null;
}) {
  const { t } = useI18n();
  if (schoolGrade) return <Badge>{t("levels.grade", { grade: schoolGrade })}</Badge>;
  if (cefrLevel) return <Badge>{cefrLevel}</Badge>;
  if (difficulty) return <Badge>{t(`levels.difficulty.${difficulty}`)}</Badge>;
  return null;
}

export function KindBadge({ kind }: { kind: MaterialKind }) {
  const { t } = useI18n();
  return <Badge tone="accent">{t(`kinds.${kind}`)}</Badge>;
}

export function SaveButton({ materialId, saved }: { materialId: string; saved: boolean }) {
  const { t } = useI18n();
  const toggle = useToggleSaved();
  return (
    <Button
      variant="ghost"
      busy={toggle.isPending}
      aria-pressed={saved}
      onClick={() => toggle.mutate({ materialId, save: !saved })}
      title={saved ? t("library.unsave") : t("library.save")}
    >
      {saved ? "★" : "☆"} <span>{saved ? t("library.saved") : t("library.save")}</span>
    </Button>
  );
}

export function MaterialCard({ item }: { item: LibraryItem }) {
  const { t, tn } = useI18n();
  const subjectName = useSubjectName();
  const countKey = item.kind === "flashcards" ? "counts.cards" : item.kind === "study_guide" ? "counts.sections" : "counts.questions";
  return (
    <article className="material-card card">
      <div className="row wrap gap-sm">
        <KindBadge kind={item.kind} />
        <LevelBadge schoolGrade={item.school_grade} cefrLevel={item.cefr_level} difficulty={item.difficulty_level} />
      </div>
      <h3 className="material-card-title">
        <Link to={`/m/${item.id}`}>{item.title}</Link>
      </h3>
      {item.description && <p className="muted clamp-2">{item.description}</p>}
      <p className="material-card-meta muted">
        {subjectName(item.subject_code)} · {tn(countKey, item.item_count)}
        {item.author_name && <> · {t("library.by", { name: item.author_name })}</>}
      </p>
      <div className="material-card-actions">
        <SaveButton materialId={item.id} saved={item.is_saved} />
      </div>
    </article>
  );
}

export function ReportDialog({ materialId, open, onClose }: { materialId: string; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const report = useReportMaterial();
  const [reason, setReason] = useState<ReportReason>("incorrect");
  const [details, setDetails] = useState("");

  const close = () => {
    report.reset();
    setDetails("");
    onClose();
  };

  const alreadyReported = report.error instanceof AppError && report.error.key === "errors.db.duplicate";

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("report.title")}
      footer={
        report.isSuccess || alreadyReported ? (
          <Button onClick={close}>{t("common.close")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" busy={report.isPending} onClick={() => report.mutate({ materialId, reason, details })}>
              {t("report.submit")}
            </Button>
          </>
        )
      }
    >
      {report.isSuccess ? (
        <Notice tone="success">{t("report.sent")}</Notice>
      ) : alreadyReported ? (
        <Notice>{t("report.already")}</Notice>
      ) : (
        <div className="stack">
          <p className="muted">{t("report.body")}</p>
          <ErrorBanner error={report.error} />
          <Field label={t("report.reason")}>
            <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`report.reasons.${r}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("report.details")}>
            <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
