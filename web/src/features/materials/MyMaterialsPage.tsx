import { Link } from "react-router-dom";
import { Badge, EmptyState, ErrorBanner, PageLoader } from "@/components/ui";
import { MATERIAL_KINDS, type MaterialStatus } from "@/domain/taxonomy";
import { useSubjectName } from "@/features/library/api";
import { KindBadge } from "@/features/library/components";
import { useI18n } from "@/i18n/I18nProvider";
import { useMyMaterials } from "./api";

const statusTone: Record<MaterialStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  published: "success",
  archived: "warning",
  hidden: "danger",
};

export function MyMaterialsPage() {
  const { t, formatDate } = useI18n();
  const subjectName = useSubjectName();
  const materials = useMyMaterials();

  if (materials.isPending) return <PageLoader />;

  return (
    <div className="container stack-lg">
      <div className="row wrap space-between">
        <h1>{t("teach.title")}</h1>
        <div className="row wrap">
          {MATERIAL_KINDS.map((kind) => (
            <Link key={kind} to={`/teach/new/${kind}`} className="btn btn-secondary">
              + {t(`kinds.${kind}`)}
            </Link>
          ))}
        </div>
      </div>
      <ErrorBanner error={materials.error} onRetry={() => void materials.refetch()} />
      {materials.data?.length === 0 ? (
        <EmptyState title={t("teach.empty")}>
          <p className="muted">{t("teach.empty.hint")}</p>
        </EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t("material.title")}</th>
              <th scope="col">{t("material.kind")}</th>
              <th scope="col">{t("material.subject")}</th>
              <th scope="col">{t("material.status")}</th>
              <th scope="col">{t("teach.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {materials.data?.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link to={`/teach/${m.id}`}>{m.title}</Link>
                  {m.status === "hidden" && m.hidden_reason && <p className="small muted">{m.hidden_reason}</p>}
                </td>
                <td>
                  <KindBadge kind={m.kind} />
                </td>
                <td>{subjectName(m.subject_code)}</td>
                <td>
                  <Badge tone={statusTone[m.status]}>{t(`status.${m.status}`)}</Badge>
                </td>
                <td>{formatDate(m.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
