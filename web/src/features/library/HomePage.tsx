import { Link } from "react-router-dom";
import { useSession } from "@/app/session";
import { EmptyState, ErrorBanner, PageLoader, Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useLibrarySearch } from "./api";
import { MaterialCard } from "./components";

function Recommendations() {
  const { t } = useI18n();
  const { profile } = useSession();
  // Ranking already prefers the profile grade; nothing is filtered out.
  const recommended = useLibrarySearch({ limit: 8 });
  return (
    <section className="stack">
      <div className="row space-between">
        <h2>{t("home.recommended")}</h2>
        <Link to="/library">{t("home.browse_all")}</Link>
      </div>
      {!profile?.grade_preference && (
        <p className="muted">
          {t("home.set_grade_hint")} <Link to="/profile">{t("nav.profile")}</Link>
        </p>
      )}
      <ErrorBanner error={recommended.error} onRetry={() => void recommended.refetch()} />
      {recommended.isPending ? (
        <Spinner label={t("common.loading")} />
      ) : recommended.data?.length ? (
        <div className="card-grid">
          {recommended.data.map((item) => (
            <MaterialCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState title={t("library.empty")} />
      )}
    </section>
  );
}

export function HomePage() {
  const { t } = useI18n();
  const { status, profile, isTeacher } = useSession();

  if (status === "loading") return <PageLoader />;

  if (status === "signedOut") {
    return (
      <div className="container hero">
        <h1>{t("home.hero.title")}</h1>
        <p className="lead">{t("home.hero.body")}</p>
        <div className="row">
          <Link to="/auth/sign-up" className="btn btn-primary">
            {t("auth.sign_up.link")}
          </Link>
          <Link to="/auth/sign-in" className="btn btn-secondary">
            {t("nav.sign_in")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container stack-lg">
      <div>
        <h1>{t("home.welcome", { name: profile?.display_name ?? "" })}</h1>
        <div className="row wrap">
          <Link to="/library" className="btn btn-primary">
            {t("nav.library")}
          </Link>
          <Link to="/progress" className="btn btn-secondary">
            {t("nav.progress")}
          </Link>
          {isTeacher && (
            <Link to="/teach" className="btn btn-secondary">
              {t("nav.teach")}
            </Link>
          )}
        </div>
      </div>
      <Recommendations />
    </div>
  );
}
