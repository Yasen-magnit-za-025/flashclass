import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Dialog, ErrorBanner, Field, Notice, PageLoader } from "@/components/ui";
import { emptyDraft, LIMITS, validateDraft, type DraftIssue, type MaterialDraft } from "@/domain/materialDraft";
import {
  CEFR_LEVELS,
  CONTENT_LANGUAGES,
  DIFFICULTY_LEVELS,
  MATERIAL_KINDS,
  SCHOOL_GRADES,
  isQuestionKind,
  type CefrLevel,
  type DifficultyLevel,
  type MaterialKind,
} from "@/domain/taxonomy";
import { GeneratePanel, type ApplyMode } from "@/features/ai/GeneratePanel";
import type { GeneratedParts } from "@/features/ai/generated";
import { findSubject, libraryKeys, useSubjects } from "@/features/library/api";
import { useI18n } from "@/i18n/I18nProvider";
import { AppError, questionIndexFromDetail, toAppError } from "@/lib/errors";
import { deleteMaterial, loadForEdit, publishMaterial, saveMaterial, unpublishMaterial } from "./api";
import { CardsEditor, QuestionsEditor, SectionsEditor } from "./editors";

type Busy = null | "save" | "publish" | "unpublish" | "delete";

export function EditorPage() {
  const { id, kind: kindParam } = useParams<{ id?: string; kind?: string }>();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const subjects = useSubjects();

  const [draft, setDraft] = useState<MaterialDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [attested, setAttested] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    if (id) {
      loadForEdit(id).then(
        (d) => !cancelled && (setDraft(d), setDirty(false)),
        (e: unknown) => !cancelled && setLoadError(toAppError(e)),
      );
    } else if (kindParam && (MATERIAL_KINDS as readonly string[]).includes(kindParam)) {
      setDraft(emptyDraft(kindParam as MaterialKind));
      setDirty(false);
    } else {
      setLoadError(new AppError("errors.not_found.title"));
    }
    return () => {
      cancelled = true;
    };
  }, [id, kindParam]);

  const scheme = findSubject(subjects.data, draft?.subjectCode)?.level_scheme;

  const update = useCallback((patch: Partial<MaterialDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
    setSavedNotice(false);
  }, []);

  // ---------------------------------------------------------------- unsaved changes guard
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && busy === null && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const invalidItems = useMemo(() => new Set(issues.map((i) => i.index).filter((i): i is number => i !== undefined)), [issues]);

  if (loadError) {
    return (
      <div className="container narrow">
        <ErrorBanner error={loadError} />
        <Link to="/teach">{t("common.back")}</Link>
      </div>
    );
  }
  if (!draft || subjects.isPending) return <PageLoader />;

  const locked = draft.status === "hidden";
  const isPublished = draft.status === "published";

  // ---------------------------------------------------------------- actions
  const refreshCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ["materials"] });
    void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
  };

  /** Saves, then reloads from the server so new question ids are known. Returns the id or null. */
  const save = async (): Promise<string | null> => {
    const found = validateDraft(draft, scheme, false);
    setIssues(found);
    if (found.length) return null;
    setActionError(null);
    try {
      const savedId = await saveMaterial(draft, scheme);
      const fresh = await loadForEdit(savedId);
      setDraft(fresh);
      setDirty(false);
      refreshCaches();
      if (!id) navigate(`/teach/${savedId}`, { replace: true });
      return savedId;
    } catch (e) {
      const appError = toAppError(e);
      const index = questionIndexFromDetail(appError.detail);
      if (index !== null) setIssues([{ code: "invalid_item", index }]);
      setActionError(appError);
      return null;
    }
  };

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toAppError(e));
    } finally {
      setBusy(null);
    }
  };

  const onSave = () =>
    run("save", async () => {
      if (await save()) setSavedNotice(true);
    });

  const openPublish = () => {
    const found = validateDraft(draft, scheme, true);
    setIssues(found);
    if (found.length === 0) {
      setAttested(false);
      setPublishOpen(true);
    }
  };

  const onPublish = () =>
    run("publish", async () => {
      const savedId = dirty || !draft.id ? await save() : draft.id;
      if (!savedId) return;
      await publishMaterial(savedId);
      setPublishOpen(false);
      setDraft(await loadForEdit(savedId));
      refreshCaches();
    });

  const onUnpublish = () =>
    run("unpublish", async () => {
      await unpublishMaterial(draft.id!);
      setDraft(await loadForEdit(draft.id!));
      refreshCaches();
    });

  const onDelete = () =>
    run("delete", async () => {
      await deleteMaterial(draft.id!);
      setDirty(false);
      refreshCaches();
      navigate("/teach", { replace: true });
    });

  const applyGenerated = (parts: GeneratedParts, mode: ApplyMode) => {
    const merge = <T,>(current: T[], incoming: T[]) => (mode === "replace" ? incoming : [...current, ...incoming]);
    update({
      title: draft.title || parts.title,
      description: draft.description || parts.description,
      questions: merge(draft.questions, parts.questions),
      cards: merge(draft.cards, parts.cards),
      sections: merge(draft.sections, parts.sections),
    });
  };

  const levelHint =
    scheme === "grade" && draft.schoolGrade
      ? t("levels.grade", { grade: draft.schoolGrade })
      : scheme === "cefr" && draft.cefrLevel
        ? `CEFR ${draft.cefrLevel}`
        : scheme === "difficulty" && draft.difficultyLevel
          ? draft.difficultyLevel
          : "";

  // ---------------------------------------------------------------- render
  return (
    <div className="container editor stack-lg">
      <header className="row wrap space-between">
        <div className="stack-sm">
          <Link to="/teach" className="small">
            ← {t("teach.title")}
          </Link>
          <h1>
            {draft.id ? t("editor.edit_title", { kind: t(`kinds.${draft.kind}`) }) : t("editor.new_title", { kind: t(`kinds.${draft.kind}`) })}
          </h1>
          <div className="row gap-sm">
            <Badge tone={isPublished ? "success" : locked ? "danger" : "neutral"}>{t(`status.${draft.status}`)}</Badge>
            {dirty && <Badge tone="warning">{t("editor.unsaved")}</Badge>}
          </div>
        </div>
        <div className="row wrap">
          {draft.id && (
            <Link className="btn btn-ghost" to={`/m/${draft.id}`}>
              {t("editor.preview")}
            </Link>
          )}
          <Button onClick={() => void onSave()} busy={busy === "save"} disabled={locked}>
            {t("common.save")}
          </Button>
          {isPublished ? (
            <Button onClick={() => void onUnpublish()} busy={busy === "unpublish"}>
              {t("editor.unpublish")}
            </Button>
          ) : (
            <Button variant="primary" onClick={openPublish} disabled={locked}>
              {t("editor.publish")}
            </Button>
          )}
        </div>
      </header>

      {locked && <Notice tone="warning">{t("editor.hidden_notice")}</Notice>}
      {isPublished && <Notice>{t("editor.published_notice")}</Notice>}
      {savedNotice && <Notice tone="success">{t("common.saved")}</Notice>}
      <ErrorBanner error={actionError} />
      {issues.length > 0 && (
        <div className="alert alert-error" role="alert">
          <p>{t("editor.issues.title")}</p>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>
                {issue.index !== undefined ? <a href={`#item-${issue.index}`}>{t(`editor.issues.${issue.code}`, { n: issue.index + 1 })}</a> : t(`editor.issues.${issue.code}`, { n: 0 })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset disabled={locked} className="stack-lg unstyled">
        <section className="card stack">
          <h2>{t("editor.details")}</h2>
          <Field label={t("material.title")}>
            <input maxLength={LIMITS.title} value={draft.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label={t("material.description")}>
            <textarea rows={2} maxLength={LIMITS.description} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
          </Field>
          <div className="grid-3">
            <Field label={t("material.subject")}>
              <select
                value={draft.subjectCode}
                onChange={(e) => update({ subjectCode: e.target.value, schoolGrade: null, cefrLevel: null, difficultyLevel: null })}
              >
                <option value="">{t("editor.choose")}</option>
                {subjects.data?.map((s) => (
                  <option key={s.code} value={s.code}>
                    {locale === "bg" ? s.name_bg : s.name_en}
                  </option>
                ))}
              </select>
            </Field>
            {scheme === "grade" && (
              <Field label={t("material.level.grade")} hint={t("editor.level.grade_hint")}>
                <select value={draft.schoolGrade ?? ""} onChange={(e) => update({ schoolGrade: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{t("editor.choose")}</option>
                  {SCHOOL_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {t("levels.grade", { grade: g })}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {scheme === "cefr" && (
              <Field label={t("material.level.cefr")}>
                <select value={draft.cefrLevel ?? ""} onChange={(e) => update({ cefrLevel: (e.target.value || null) as CefrLevel | null })}>
                  <option value="">{t("editor.choose")}</option>
                  {CEFR_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {scheme === "difficulty" && (
              <Field label={t("material.level.difficulty")}>
                <select
                  value={draft.difficultyLevel ?? ""}
                  onChange={(e) => update({ difficultyLevel: (e.target.value || null) as DifficultyLevel | null })}
                >
                  <option value="">{t("editor.choose")}</option>
                  {DIFFICULTY_LEVELS.map((d) => (
                    <option key={d} value={d}>
                      {t(`levels.difficulty.${d}`)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t("material.language")} hint={t("editor.language_hint")}>
              <input list="content-languages" maxLength={11} value={draft.language} onChange={(e) => update({ language: e.target.value.trim().toLowerCase() })} />
            </Field>
            <datalist id="content-languages">
              {CONTENT_LANGUAGES.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          {isQuestionKind(draft.kind) && (
            <label className="checkbox">
              <input type="checkbox" checked={draft.showAnswersAfterSubmit} onChange={(e) => update({ showAnswersAfterSubmit: e.target.checked })} />
              <span>{t("editor.show_answers")}</span>
            </label>
          )}
        </section>

        <GeneratePanel kind={draft.kind} language={draft.language} levelHint={levelHint} onApply={applyGenerated} />

        {isQuestionKind(draft.kind) && (
          <QuestionsEditor questions={draft.questions} invalid={invalidItems} onChange={(questions) => update({ questions })} />
        )}
        {draft.kind === "flashcards" && <CardsEditor cards={draft.cards} invalid={invalidItems} onChange={(cards) => update({ cards })} />}
        {draft.kind === "study_guide" && (
          <SectionsEditor sections={draft.sections} invalid={invalidItems} onChange={(sections) => update({ sections })} />
        )}
      </fieldset>

      {draft.id && !isPublished && !locked && (
        <section className="card danger-zone">
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t("editor.delete")}
          </Button>
        </section>
      )}

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={t("editor.publish_dialog.title")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" disabled={!attested} busy={busy === "publish"} onClick={() => void onPublish()}>
              {t("editor.publish")}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>{t("editor.publish_dialog.body")}</p>
          <label className="checkbox">
            <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            <span>{t("editor.publish_dialog.attest")}</span>
          </label>
          <p className="muted small">{t("editor.publish_dialog.note")}</p>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("editor.delete_dialog.title")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" busy={busy === "delete"} onClick={() => void onDelete()}>
              {t("editor.delete")}
            </Button>
          </>
        }
      >
        <p>{t("editor.delete_dialog.body")}</p>
      </Dialog>

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title={t("editor.leave_dialog.title")}
        footer={
          <>
            <Button variant="ghost" onClick={() => blocker.reset?.()}>
              {t("editor.leave_dialog.stay")}
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              {t("editor.leave_dialog.leave")}
            </Button>
          </>
        }
      >
        <p>{t("editor.leave_dialog.body")}</p>
      </Dialog>
    </div>
  );
}
