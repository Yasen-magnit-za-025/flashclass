import { Link } from "react-router-dom";
import { EmptyState, ErrorBanner, Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useLibrarySearch } from "./api";
import { MaterialCard } from "./components";

/** Bookmarks. Only currently published items appear; hidden/unpublished ones drop out automatically. */
export function SavedPage() {
  const { t } = useI18n();
  const saved = useLibrarySearch({ savedOnly: true, limit: 100 });
  return (
    <div className="container">
      <h1>{t("saved.title")}</h1>
      <ErrorBanner error={saved.error} onRetry={() => void saved.refetch()} />
      {saved.isPending ? (
        <Spinner label={t("common.loading")} />
      ) : saved.data?.length ? (
        <div className="card-grid">
          {saved.data.map((item) => (
            <MaterialCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState title={t("saved.empty")}>
          <Link to="/library">{t("home.browse_all")}</Link>
        </EmptyState>
      )}
    </div>
  );
}
