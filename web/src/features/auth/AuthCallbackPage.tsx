import { Navigate } from "react-router-dom";
import { useSession } from "@/app/session";
import { Notice, PageLoader } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";

/** Landing page for email confirmation and teacher invitation links. */
export function AuthCallbackPage() {
  const { status } = useSession();
  const { t } = useI18n();
  const errorDescription = new URLSearchParams(window.location.search).get("error_description");

  if (errorDescription) {
    return (
      <div className="container auth-card">
        <Notice tone="warning">{t("auth.callback.failed")}</Notice>
      </div>
    );
  }
  if (status === "loading") return <PageLoader />;
  return <Navigate to={status === "signedIn" ? "/" : "/auth/sign-in"} replace />;
}
