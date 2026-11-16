import { Link } from "react-router-dom";
import { Badge, EmptyState, ErrorBanner, PageLoader } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useMyAttempts } from "./api";

/** Learner-owned progress. RLS guarantees only the caller's attempts are returned. */
export function ProgressPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const attempts = useMyAttempts();

  if (attempts.isPending) return <PageLoader />;
  const list = attempts.data ?? [];
  const submitted = list.filter((a) => a.status === "submitted");
  const average = submitted.length
    ? submitted.reduce((sum, a) => sum + Number(a.score_percent ?? 0), 0) / submitted.length
    : null;
  const pct = (v: number) => formatNumber(v / 100, { style: "percent", maximumFractionDigits: 0 });

  return (
    <div className="container stack-lg">
      <h1>{t("progress.title")}</h1>
      <p className="muted">{t("progress.private")}</p>
      <ErrorBanner error={attempts.error} onRetry={() => void attempts.refetch()} />

      <div className="stats">
        <div className="card stat">
          <span className="stat-value">{submitted.length}</span>
          <span className="muted">{t("progress.completed")}</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{average === null ? "—" : pct(average)}</span>
          <span className="muted">{t("progress.average")}</span>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title={t("progress.empty")}>
          <Link to="/library">{t("home.browse_all")}</Link>
        </EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t("progress.material")}</th>
              <th scope="col">{t("progress.date")}</th>
              <th scope="col">{t("results.score")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.status === "submitted" ? (
                    <Link to={`/attempts/${a.id}`}>{a.material_title}</Link>
                  ) : a.material_id ? (
                    <Link to={`/m/${a.material_id}/take`}>{a.material_title}</Link>
                  ) : (
                    a.material_title
                  )}
                </td>
                <td>{formatDate(a.submitted_at ?? a.started_at)}</td>
                <td>
                  {a.status === "submitted" ? (
                    `${pct(Number(a.score_percent ?? 0))} (${a.correct_count}/${a.question_count})`
                  ) : (
                    <Badge tone="warning">{t("progress.in_progress")}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
