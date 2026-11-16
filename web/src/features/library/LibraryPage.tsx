import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, EmptyState, ErrorBanner, Field, Spinner } from "@/components/ui";
import {
  CEFR_LEVELS,
  CONTENT_LANGUAGES,
  DIFFICULTY_LEVELS,
  MATERIAL_KINDS,
  SCHOOL_GRADES,
  type CefrLevel,
  type DifficultyLevel,
  type MaterialKind,
} from "@/domain/taxonomy";
import { useI18n } from "@/i18n/I18nProvider";
import { findSubject, useLibrarySearch, useSubjects, type LibraryFilters } from "./api";
import { MaterialCard } from "./components";

const PAGE_SIZE = 24;

function filtersFromParams(params: URLSearchParams): LibraryFilters {
  const grade = Number(params.get("grade"));
  return {
    query: params.get("q") ?? undefined,
    subject: params.get("subject") ?? undefined,
    kind: (params.get("kind") as MaterialKind | null) ?? undefined,
    schoolGrade: Number.isInteger(grade) && grade >= 1 && grade <= 12 ? grade : undefined,
    cefrLevel: (params.get("cefr") as CefrLevel | null) ?? undefined,
    difficulty: (params.get("difficulty") as DifficultyLevel | null) ?? undefined,
    language: params.get("lang") ?? undefined,
  };
}

export function LibraryPage() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const subjects = useSubjects();
  const filters = filtersFromParams(params);
  const [page, setPage] = useState(0);
  const [queryInput, setQueryInput] = useState(filters.query ?? "");
  const search = useLibrarySearch({ ...filters, limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE });
  const scheme = findSubject(subjects.data, filters.subject)?.level_scheme;

  // Debounce the free-text query into the URL.
  useEffect(() => {
    const handle = setTimeout(() => update("q", queryInput.trim() || null), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  function update(key: string, value: string | null) {
    setPage(0);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === "subject") ["grade", "cefr", "difficulty"].forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );
  }

  const items = search.data ?? [];
  const hasMore = items.length > PAGE_SIZE;

  return (
    <div className="container">
      <h1>{t("library.title")}</h1>
      <p className="muted">{t("library.subtitle")}</p>

      <form className="filters card" role="search" onSubmit={(e) => e.preventDefault()}>
        <Field label={t("library.search")}>
          <input type="search" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder={t("library.search.placeholder")} />
        </Field>
        <Field label={t("material.subject")}>
          <select value={filters.subject ?? ""} onChange={(e) => update("subject", e.target.value || null)}>
            <option value="">{t("common.all")}</option>
            {subjects.data?.map((s) => (
              <option key={s.code} value={s.code}>
                {locale === "bg" ? s.name_bg : s.name_en}
              </option>
            ))}
          </select>
        </Field>
        {scheme === "grade" && (
          <Field label={t("material.level.grade")}>
            <select value={filters.schoolGrade ?? ""} onChange={(e) => update("grade", e.target.value || null)}>
              <option value="">{t("common.all")}</option>
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
            <select value={filters.cefrLevel ?? ""} onChange={(e) => update("cefr", e.target.value || null)}>
              <option value="">{t("common.all")}</option>
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
            <select value={filters.difficulty ?? ""} onChange={(e) => update("difficulty", e.target.value || null)}>
              <option value="">{t("common.all")}</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {t(`levels.difficulty.${d}`)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("material.kind")}>
          <select value={filters.kind ?? ""} onChange={(e) => update("kind", e.target.value || null)}>
            <option value="">{t("common.all")}</option>
            {MATERIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("material.language")}>
          <select value={filters.language ?? ""} onChange={(e) => update("lang", e.target.value || null)}>
            <option value="">{t("common.all")}</option>
            {CONTENT_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
      </form>

      <ErrorBanner error={search.error} onRetry={() => void search.refetch()} />
      {search.isPending ? (
        <Spinner label={t("common.loading")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("library.empty")} />
      ) : (
        <>
          <div className="card-grid" aria-busy={search.isFetching}>
            {items.slice(0, PAGE_SIZE).map((item) => (
              <MaterialCard key={item.id} item={item} />
            ))}
          </div>
          <div className="row pagination">
            <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              {t("common.previous")}
            </Button>
            <Button disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
              {t("common.next")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
