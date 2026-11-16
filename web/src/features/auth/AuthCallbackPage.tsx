import { Navigate } from "react-router-dom";
import { useSession } from "@/app/session";
import { PageLoader } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { AuthLayout, AuthLink, FormAlert } from "./components";

/** Landing page for email confirmation links. */
export function AuthCallbackPage() {
  const { status } = useSession();
  const { t } = useI18n();
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const failed = params.get("error_description") ?? hash.get("error_description");

  if (failed) {
    return (
      <AuthLayout title={t("auth.callback.title")} footer={<AuthLink to="/auth/sign-in">{t("auth.back_to_sign_in")}</AuthLink>}>
        <FormAlert tone="error">{t("auth.callback.failed")}</FormAlert>
      </AuthLayout>
    );
  }
  if (status === "loading") return <PageLoader />;
  return <Navigate to={status === "signedIn" ? "/" : "/auth/sign-in"} replace />;
}
